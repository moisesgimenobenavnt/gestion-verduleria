require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXIÓN ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verduleria_vision_moises_pro';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ SERVIDOR PRO ACTIVADO"))
    .catch(err => console.error("❌ ERROR BD:", err));

// --- MODELOS ---
const Config = mongoose.model('Config', new mongoose.Schema({
    clave: { type: String, unique: true }, 
    valor: String 
}));

const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true }, 
    telefono: { type: String, default: "" }, 
    deuda: { type: Number, default: 0 } 
}));

const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true, unique: true }, 
    alias: { type: String, uppercase: true, default: "CUENTA" },
    saldoPorPagar: { type: Number, default: 0 }, 
    topeMaximo: { type: Number, default: 1000000 }
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: { type: String, uppercase: true }, 
    compra: Number, 
    pago: Number, 
    
    // Desglose Pagos
    pagoEfectivo: { type: Number, default: 0 },
    pagoTarjeta: { type: Number, default: 0 },
    pagoTransferencia: { type: Number, default: 0 },
    
    metodo: String, 
    destino: { type: String, uppercase: true }, 
    
    fecha: { type: Date, default: Date.now },
    
    esGasto: { type: Boolean, default: false },
    detalleGasto: { type: String, uppercase: true },
    
    esBorrado: { type: Boolean, default: false }, 
    fechaBorrado: Date,
    usuarioBorrado: String,
    
    esCierre: { type: Boolean, default: false }, 
    tipoCierre: String, 
    montoCierre: Number,
    usuarioCierre: String // AQUÍ SE GUARDA QUIÉN GUARDÓ LA PLATA
}));

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
    const { usuario, clave } = req.body;
    const u = usuario.toUpperCase().trim();
    
    let pedirBackup = false;
    // Lógica Backup Diario para Admin
    if (u === 'ADMIN') {
        const hoy = new Date().toLocaleDateString();
        const conf = await Config.findOne({ clave: 'ULTIMO_BACKUP' });
        if (!conf || conf.valor !== hoy) pedirBackup = true;
    }

    if (u === 'LOCAL' && clave === '1234') return res.json({ ok: true, rol: 'EMPLEADO', nombre: 'VENDEDOR' });
    if (u === 'ADMIN' && clave === 'DUENO2026') return res.json({ ok: true, rol: 'DUENO', nombre: 'ADMINISTRADOR', pedirBackup });
    if (u === 'MOISES' && clave === 'MASTERKEY') return res.json({ ok: true, rol: 'DEV', nombre: 'SOPORTE TÉCNICO' });

    res.status(401).json({ ok: false });
});

app.post('/api/backup/confirmar', async (req, res) => {
    const hoy = new Date().toLocaleDateString();
    await Config.findOneAndUpdate({ clave: 'ULTIMO_BACKUP' }, { valor: hoy }, { upsert: true });
    res.json({ ok: true });
});

// --- OPERATIVA ---
app.get('/api/sugerencias/:query', async (req, res) => {
    const q = req.params.query;
    if(!q) return res.json([]);
    const regex = new RegExp(q, 'i');
    const clientes = await Cliente.find({ $or: [{nombre: regex}, {telefono: regex}] }).limit(10).sort({nombre:1});
    res.json(clientes);
});

app.post('/api/clientes/crear', async (req, res) => {
    const { nombre } = req.body;
    let c = await Cliente.findOne({ nombre: nombre.toUpperCase() });
    if (!c) c = await Cliente.create({ nombre: nombre.toUpperCase(), telefono: "" });
    res.json(c);
});

app.post('/api/clientes/editar', async (req, res) => {
    const { id, telefono } = req.body;
    await Cliente.findByIdAndUpdate(id, { telefono });
    res.json({ ok: true });
});

app.post('/api/operaciones', async (req, res) => {
    const body = req.body;
    
    // GASTO
    if (body.esGasto) {
        await new Operacion({
            cliente: "GASTO OPERATIVO",
            compra: 0, pago: body.pago, metodo: 'EFECTIVO',
            esGasto: true, detalleGasto: body.detalleGasto.toUpperCase()
        }).save();
        return res.json({ ok: true });
    }

    // VENTA
    const cli = await Cliente.findById(body.clienteId);
    if (!cli) return res.status(404).json({error: "Cliente no existe"});

    // Cálculo Deuda
    const totalPagado = body.efectivo + body.tarjeta + body.transferencia;
    const saldoOperacion = body.compra - totalPagado;
    cli.deuda += saldoOperacion; 
    await cli.save();

    // Proveedor
    let nombreDestino = "";
    if (body.transferencia > 0 && body.receptorId) {
        const rec = await Receptor.findById(body.receptorId);
        if (rec) {
            rec.saldoPorPagar -= body.transferencia;
            if(rec.saldoPorPagar < 0) rec.saldoPorPagar = 0;
            await rec.save();
            nombreDestino = rec.nombre;
        }
    }

    await new Operacion({
        cliente: cli.nombre,
        compra: body.compra,
        pago: totalPagado,
        pagoEfectivo: body.efectivo,
        pagoTarjeta: body.tarjeta,
        pagoTransferencia: body.transferencia,
        metodo: body.metodo,
        destino: nombreDestino
    }).save();

    res.json({ ok: true });
});

// --- CAJA (CORREGIDO DESGLOSE ADMIN) ---
app.post('/api/caja', async (req, res) => {
    const { rol, fechaDesde, fechaHasta } = req.body;

    let inicio = new Date(); inicio.setHours(0,0,0,0);
    let fin = new Date(); fin.setHours(23,59,59,999);

    if (rol !== 'EMPLEADO' && fechaDesde && fechaHasta) {
        inicio = new Date(fechaDesde);
        fin = new Date(fechaHasta); fin.setHours(23,59,59,999);
    }

    const ops = await Operacion.find({ fecha: { $gte: inicio, $lte: fin } }).sort({ fecha: -1 });

    let tVenta=0, tEfvo=0, tTarjeta=0, tTransf=0, tGastos=0, tRetiros=0;

    const movimientos = ops.map(o => {
        if (!o.esBorrado) {
            if (o.esCierre) {
                 tRetiros += o.montoCierre;
            } else if (o.esGasto) {
                tGastos += o.pago;
                tEfvo -= o.pago; // Resta del efectivo
            } else {
                tVenta += o.compra;
                tEfvo += o.pagoEfectivo;
                tTarjeta += o.pagoTarjeta;
                tTransf += o.pagoTransferencia;
            }
        }
        
        // EMPLEADO: SOLO VE VENTAS (10 ULTIMAS)
        if (rol === 'EMPLEADO') {
            if (o.esGasto || o.esCierre) return null; 
            return {
                _id: o._id, fecha: o.fecha,
                cliente: o.cliente,
                pago: o.pago,
                esBorrado: o.esBorrado
            };
        }
        // ADMIN: VE TODO
        return o; 
    }).filter(x => x !== null);

    if (rol === 'EMPLEADO') {
        res.json({
            totales: null,
            movimientos: movimientos.slice(0, 10)
        });
    } else {
        // ADMIN RECIBE TODOS LOS TOTALES
        res.json({
            totales: { 
                venta: tVenta, 
                efectivoReal: tEfvo, 
                tarjeta: tTarjeta, 
                transf: tTransf, 
                gastos: tGastos, 
                guardadoDeclarado: tRetiros,
                diferencia: tRetiros - tEfvo
            },
            movimientos: movimientos
        });
    }
});

// CIERRE CAJA (GUARDANDO USUARIO)
app.post('/api/cierre-caja', async (req, res) => {
    const { tipo, monto, usuario } = req.body;
    await new Operacion({
        cliente: tipo === 'TOTAL' ? "CIERRE TOTAL CAJA" : "GUARDADO PARCIAL",
        compra: 0, pago: 0, metodo: 'SISTEMA',
        esCierre: true, tipoCierre: tipo, montoCierre: monto, 
        usuarioCierre: usuario // GUARDAMOS EL NOMBRE
    }).save();
    res.json({ ok: true });
});

app.post('/api/anular', async (req, res) => {
    const { id, usuario } = req.body;
    await Operacion.findByIdAndUpdate(id, { 
        esBorrado: true, fechaBorrado: new Date(), usuarioBorrado: usuario 
    });
    res.json({ ok: true });
});

// GASTOS (CORREGIDO PARA CREAR SI NO EXISTE)
app.get('/api/gastos/sugerencias/:query', async (req, res) => {
    const q = req.params.query;
    const regex = new RegExp(q, 'i');
    const gastos = await Operacion.find({ esGasto: true, detalleGasto: regex }).distinct('detalleGasto');
    res.json(gastos.slice(0, 5));
});

// RECEPTORES
app.get('/api/receptores', async (req, res) => {
    const list = await Receptor.find().sort({nombre: 1});
    res.json(list);
});
app.post('/api/receptores', async (req, res) => {
    const { nombre, alias } = req.body;
    await new Receptor({ nombre: nombre.toUpperCase(), alias: alias.toUpperCase() }).save();
    res.json({ ok: true });
});

app.get('/api/backup/download', (req, res) => {
    const data = "BACKUP_" + Date.now();
    res.setHeader('Content-disposition', 'attachment; filename=BACKUP.enc');
    res.send(Buffer.from(data).toString('base64'));
});

// Server
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR PRO CORRIENDO EN PUERTO ${PORT}`));
