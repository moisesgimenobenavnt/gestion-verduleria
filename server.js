require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXIÓN ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verduleria_vision_moises';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ SERVIDOR 5.0 CONECTADO"))
    .catch(err => console.error("❌ ERROR BD:", err));

// --- MODELOS ---
// Configuración Global (Para fecha de Backup)
const Config = mongoose.model('Config', new mongoose.Schema({
    clave: { type: String, unique: true }, // 'ULTIMO_BACKUP'
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
    compra: Number, // Monto total mercadería
    pago: Number,   // Monto que pone el cliente (Suma de metodos)
    
    // Desglose de Pago Combinado
    pagoEfectivo: { type: Number, default: 0 },
    pagoTarjeta: { type: Number, default: 0 },
    pagoTransferencia: { type: Number, default: 0 },
    
    metodo: String, // 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO'
    destino: { type: String, uppercase: true }, // Receptor ID o Nombre
    
    fecha: { type: Date, default: Date.now }, // Fecha Creación
    fechaEdicion: Date, // Huella Forense
    
    esGasto: { type: Boolean, default: false },
    detalleGasto: { type: String, uppercase: true },
    
    esBorrado: { type: Boolean, default: false }, // Soft Delete (Fila Negra)
    fechaBorrado: Date,
    usuarioBorrado: String,
    
    esCierre: { type: Boolean, default: false }, 
    tipoCierre: String, // 'PARCIAL' o 'TOTAL'
    montoCierre: Number,
    usuarioCierre: String
}));

// --- API LOGIN & BACKUP ---
app.post('/api/login', async (req, res) => {
    const { usuario, clave } = req.body;
    const u = usuario.toUpperCase().trim();
    
    // Verificar Backup del Día (Solo para Dueño)
    let pedirBackup = false;
    if (u === 'ADMIN') {
        const hoy = new Date().toLocaleDateString();
        const conf = await Config.findOne({ clave: 'ULTIMO_BACKUP' });
        if (!conf || conf.valor !== hoy) {
            pedirBackup = true;
        }
    }

    if (u === 'LOCAL' && clave === '1234') return res.json({ ok: true, rol: 'EMPLEADO', nombre: 'VENDEDOR' });
    if (u === 'ADMIN' && clave === 'DUENO2026') return res.json({ ok: true, rol: 'DUENO', nombre: 'ADMINISTRADOR', pedirBackup });
    if (u === 'MOISES' && clave === 'MASTERKEY') return res.json({ ok: true, rol: 'DEV', nombre: 'SOPORTE TÉCNICO' }); // FANTASMA

    res.status(401).json({ ok: false });
});

app.post('/api/backup/confirmar', async (req, res) => {
    const hoy = new Date().toLocaleDateString();
    await Config.findOneAndUpdate({ clave: 'ULTIMO_BACKUP' }, { valor: hoy }, { upsert: true });
    res.json({ ok: true });
});

// --- OPERATIVA ---
// 1. CLIENTES
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

// 2. OPERACIONES (Venta Multi-Pago y Gastos)
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

    // Cálculo Deuda (Total Compra - Total Pagado)
    const totalPagado = body.efectivo + body.tarjeta + body.transferencia;
    const saldoOperacion = body.compra - totalPagado;
    cli.deuda += saldoOperacion; 
    await cli.save();

    // Actualizar Receptor si hubo transferencia
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

    const op = new Operacion({
        cliente: cli.nombre,
        compra: body.compra,
        pago: totalPagado,
        pagoEfectivo: body.efectivo,
        pagoTarjeta: body.tarjeta,
        pagoTransferencia: body.transferencia,
        metodo: body.metodo, // 'MIXTO' o simple
        destino: nombreDestino
    });
    await op.save();
    res.json({ ok: true });
});

// 3. CAJA Y ESTADÍSTICAS (La Lógica Visión Moisés)
app.post('/api/caja', async (req, res) => {
    const { rol, fechaDesde, fechaHasta } = req.body;

    let inicio = new Date(); inicio.setHours(0,0,0,0);
    let fin = new Date(); fin.setHours(23,59,59,999);

    if (rol !== 'EMPLEADO' && fechaDesde && fechaHasta) {
        inicio = new Date(fechaDesde);
        fin = new Date(fechaHasta); fin.setHours(23,59,59,999);
    }

    const ops = await Operacion.find({ fecha: { $gte: inicio, $lte: fin } }).sort({ fecha: -1 });

    // Cálculos para Dueño
    let tVenta=0, tEfvo=0, tTarjeta=0, tTransf=0, tGastos=0, tRetiros=0;

    const movimientos = ops.map(o => {
        if (!o.esBorrado) {
            if (o.esCierre) {
                 tRetiros += o.montoCierre; // Sumamos lo que el empleado "dijo" que guardó
            } else if (o.esGasto) {
                tGastos += o.pago;
                tEfvo -= o.pago;
            } else {
                tVenta += o.compra;
                tEfvo += o.pagoEfectivo;
                tTarjeta += o.pagoTarjeta;
                tTransf += o.pagoTransferencia;
            }
        }
        
        // FILTRO VISUAL EMPLEADO
        if (rol === 'EMPLEADO') {
            // No ver gastos, no ver cierres anteriores, solo VENTAS ÚLTIMAS 10
            if (o.esGasto || o.esCierre) return null; 
            return {
                _id: o._id, fecha: o.fecha,
                cliente: o.cliente,
                pago: o.pago, // Solo ve el total pagado
                esBorrado: o.esBorrado
            };
        }
        return o; 
    }).filter(x => x !== null); // Limpiar nulos del empleado

    if (rol === 'EMPLEADO') {
        res.json({
            totales: null, // Ceguera Financiera
            movimientos: movimientos.slice(0, 10) // Solo ultimas 10 ventas
        });
    } else {
        res.json({
            totales: { 
                venta: tVenta, 
                efectivoReal: tEfvo, 
                tarjeta: tTarjeta, 
                transf: tTransf, 
                gastos: tGastos, 
                guardadoDeclarado: tRetiros,
                diferencia: tRetiros - tEfvo // Sobrante o Faltante
            },
            movimientos: movimientos
        });
    }
});

// Cierres (Parcial y Total)
app.post('/api/cierre-caja', async (req, res) => {
    const { tipo, monto, usuario } = req.body;
    await new Operacion({
        cliente: tipo === 'TOTAL' ? "CIERRE TOTAL CAJA" : "GUARDADO PARCIAL",
        compra: 0, pago: 0, metodo: 'SISTEMA',
        esCierre: true, tipoCierre: tipo, montoCierre: monto, usuarioCierre: usuario
    }).save();
    res.json({ ok: true });
});

// Borrado (Soft Delete)
app.post('/api/anular', async (req, res) => {
    const { id, usuario } = req.body;
    await Operacion.findByIdAndUpdate(id, { 
        esBorrado: true, fechaBorrado: new Date(), usuarioBorrado: usuario 
    });
    res.json({ ok: true });
});

// Receptores (Info de deuda para bloqueo)
app.get('/api/receptores', async (req, res) => {
    const list = await Receptor.find().sort({nombre: 1});
    res.json(list);
});
app.post('/api/receptores', async (req, res) => {
    const { nombre, alias } = req.body;
    await new Receptor({ nombre: nombre.toUpperCase(), alias: alias.toUpperCase() }).save();
    res.json({ ok: true });
});

// Backup Mock
app.get('/api/backup/download', (req, res) => {
    const data = "BACKUP_ENCRIPTADO_" + Date.now();
    res.setHeader('Content-disposition', 'attachment; filename=BACKUP_DATA.enc');
    res.send(Buffer.from(data).toString('base64'));
});

// Server
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 PUERTO ${PORT} - VERSIÓN MOISÉS ACTIVADA`));
