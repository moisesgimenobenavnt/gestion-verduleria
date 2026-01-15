require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXIÓN BASE DE DATOS ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verduleria_saas_v4';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Servidor Conectado a la Nube"))
    .catch(err => console.error("❌ Error BD:", err));

// --- MODELOS ---
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true }, 
    telefono: { type: String, default: "" }, // AHORA OBLIGATORIO Y EDITABLE
    deuda: { type: Number, default: 0 } 
}));

const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true, unique: true }, 
    alias: { type: String, uppercase: true, default: "CUENTA" }, // NUEVO: ALIAS
    saldoPorPagar: { type: Number, default: 0 }, 
    topeMaximo: { type: Number, default: 1000000 }
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: { type: String, uppercase: true }, 
    compra: Number, 
    pago: Number, 
    metodo: String, 
    destino: { type: String, uppercase: true }, // Nombre Receptor
    fecha: { type: Date, default: Date.now },
    esGasto: { type: Boolean, default: false },
    detalleGasto: { type: String, uppercase: true }, // "BOLSAS", "LIMPIEZA"
    esBorrado: { type: Boolean, default: false },
    fechaBorrado: Date,
    usuarioBorrado: String,
    esCierre: { type: Boolean, default: false }, // Para marcar cierres de caja
    montoCierre: Number
}));

// --- LOGIN 3 LLAVES ---
app.post('/api/login', (req, res) => {
    const { usuario, clave } = req.body;
    const u = usuario.toUpperCase().trim();
    
    // 1. EMPLEADO (Caja Ciega)
    if (u === 'LOCAL' && clave === '1234') return res.json({ ok: true, rol: 'EMPLEADO', nombre: 'VENDEDOR' });
    // 2. DUEÑO (Full Access)
    if (u === 'ADMIN' && clave === 'DUENO2026') return res.json({ ok: true, rol: 'DUENO', nombre: 'ADMINISTRADOR' });
    // 3. PROVEEDOR (Dev/Backup)
    if (u === 'MOISES' && clave === 'MASTERKEY') return res.json({ ok: true, rol: 'DEV', nombre: 'SOPORTE TÉCNICO' });

    res.status(401).json({ ok: false });
});

// --- RUTAS API ---

// 1. CLIENTES (Búsqueda Híbrida: Nombre o Teléfono)
app.get('/api/sugerencias/:query', async (req, res) => {
    const q = req.params.query;
    if(!q) return res.json([]);
    const regex = new RegExp(q, 'i');
    // Busca por nombre O por teléfono
    const clientes = await Cliente.find({ $or: [{nombre: regex}, {telefono: regex}] }).limit(10).sort({nombre:1});
    res.json(clientes);
});

app.post('/api/clientes/crear', async (req, res) => {
    const { nombre } = req.body;
    let c = await Cliente.findOne({ nombre: nombre.toUpperCase() });
    if (!c) c = await Cliente.create({ nombre: nombre.toUpperCase(), telefono: "" });
    res.json(c);
});

app.post('/api/clientes/actualizar-telefono', async (req, res) => {
    const { id, telefono } = req.body;
    await Cliente.findByIdAndUpdate(id, { telefono });
    res.json({ ok: true });
});

// 2. OPERACIONES (Venta, Cobro, Gasto)
app.post('/api/operaciones', async (req, res) => {
    const { clienteId, compra, pago, metodo, receptorId, esGasto, detalleGasto } = req.body;
    
    // CASO GASTO
    if (esGasto) {
        const op = new Operacion({
            cliente: "GASTO INTERNO",
            compra: 0, pago: pago, metodo: 'EFECTIVO', // Gastos salen de Efectivo
            esGasto: true, detalleGasto: detalleGasto.toUpperCase()
        });
        await op.save();
        return res.json({ ok: true });
    }

    // CASO VENTA NORMAL
    const cli = await Cliente.findById(clienteId);
    if (!cli) return res.status(404).json({error: "Cliente no encontrado"});

    const saldoOperacion = compra - pago; 
    cli.deuda += saldoOperacion; 
    await cli.save();

    let nombreDestino = "";
    if (metodo === 'TRANSFERENCIA' && pago > 0 && receptorId) {
        const rec = await Receptor.findById(receptorId);
        if (rec) {
            rec.saldoPorPagar -= pago; 
            if(rec.saldoPorPagar < 0) rec.saldoPorPagar = 0; 
            await rec.save();
            nombreDestino = rec.nombre;
        }
    }

    const op = new Operacion({
        cliente: cli.nombre,
        compra, pago, metodo,
        destino: nombreDestino
    });
    await op.save();

    res.json({ ok: true });
});

// 3. CAJA (Lógica Ciega vs Full)
app.post('/api/caja', async (req, res) => {
    const { rol, fechaDesde, fechaHasta } = req.body; // Filtros de fecha para Dueño
    
    // Rango de fechas
    let inicio = new Date(); inicio.setHours(0,0,0,0);
    let fin = new Date(); fin.setHours(23,59,59,999);

    if (rol === 'DUENO' && fechaDesde && fechaHasta) {
        inicio = new Date(fechaDesde);
        fin = new Date(fechaHasta); fin.setHours(23,59,59,999);
    }

    const ops = await Operacion.find({ fecha: { $gte: inicio, $lte: fin } }).sort({ fecha: -1 });
    
    // Cálculos Reales
    let tVenta=0, tEfvo=0, tTarjeta=0, tTransf=0, tGastos=0;

    const movimientosFiltrados = ops.map(o => {
        if (!o.esBorrado && !o.esCierre) {
            if (o.esGasto) {
                tGastos += o.pago;
                tEfvo -= o.pago; // Resta de efectivo
            } else {
                tVenta += o.compra;
                if(o.metodo === 'EFECTIVO') tEfvo += o.pago;
                if(o.metodo === 'TARJETA') tTarjeta += o.pago;
                if(o.metodo === 'TRANSFERENCIA') tTransf += o.pago;
            }
        }

        // CENSURA PARA EMPLEADO
        if (rol === 'EMPLEADO') {
            // Si es transferencia, ocultar nombre y destino
            let cliDisplay = o.cliente;
            if (o.metodo === 'TRANSFERENCIA') cliDisplay = "Transferencia (Oculto)";
            
            return {
                _id: o._id,
                fecha: o.fecha,
                cliente: o.esGasto ? o.detalleGasto : cliDisplay,
                pago: o.pago,
                metodo: o.metodo,
                esGasto: o.esGasto,
                esBorrado: o.esBorrado,
                usuarioBorrado: o.usuarioBorrado,
                esCierre: o.esCierre
            };
        }
        return o; // Dueño ve todo
    });

    if (rol === 'EMPLEADO') {
        // Enviar Solo 10 últimos y TOTALES EN CERO (Caja Ciega)
        res.json({
            totales: { totalVenta: 0, efectivo: 0, tarjeta: 0, transf: 0, gastos: 0 },
            movimientos: movimientosFiltrados.slice(0, 10)
        });
    } else {
        // Enviar Todo Real
        res.json({
            totales: { totalVenta: tVenta, efectivo: tEfvo, tarjeta: tTarjeta, transf: tTransf, gastos: tGastos },
            movimientos: movimientosFiltrados
        });
    }
});

// Cierre de Caja (Guardar registro)
app.post('/api/cierre-caja', async (req, res) => {
    const { monto } = req.body;
    await new Operacion({
        cliente: "CIERRE DE TURNO",
        compra: 0, pago: 0, metodo: 'SISTEMA',
        esCierre: true, montoCierre: monto
    }).save();
    res.json({ ok: true });
});

// Anulación
app.post('/api/operaciones/anular', async (req, res) => {
    const { idOperacion, usuario } = req.body;
    const op = await Operacion.findById(idOperacion);
    if (!op) return res.status(404).json({error: "No existe"});
    op.esBorrado = true;
    op.fechaBorrado = new Date();
    op.usuarioBorrado = usuario;
    await op.save();
    res.json({ ok: true });
});

// Sugerencias de Gastos (Smart Search)
app.get('/api/gastos/sugerencias/:query', async (req, res) => {
    const q = req.params.query;
    const regex = new RegExp(q, 'i');
    // Busca gastos previos para autocompletar
    const gastos = await Operacion.find({ esGasto: true, detalleGasto: regex }).distinct('detalleGasto');
    res.json(gastos.slice(0, 5));
});

// 4. RECEPTORES
app.get('/api/receptores', async (req, res) => {
    const list = await Receptor.find().sort({nombre: 1});
    res.json(list);
});
app.post('/api/receptores', async (req, res) => {
    const { nombre, alias } = req.body;
    await new Receptor({ nombre: nombre.toUpperCase(), alias: alias.toUpperCase() }).save();
    res.json({ ok: true });
});

// 5. BACKUP MOCKUP
app.get('/api/backup/download', (req, res) => {
    const data = "BACKUP_ENCRIPTADO_DE_SEGURIDAD_" + Date.now();
    res.setHeader('Content-disposition', 'attachment; filename=BACKUP_DATA.enc');
    res.setHeader('Content-type', 'text/plain');
    res.send(Buffer.from(data).toString('base64'));
});

// Servidor
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR V4 LISTO EN PUERTO ${PORT}`));
