require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXIÓN BASE DE DATOS (NUBE) ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verduleria_saas_final';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado a la Nube (MongoDB)"))
    .catch(err => console.error("❌ Error Base de Datos:", err));

// --- MODELOS DE DATOS ---
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true }, 
    telefono: { type: String, default: "" }, 
    deuda: { type: Number, default: 0 } 
}));

const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true, unique: true }, 
    alias: { type: String, default: "" },
    saldoPorPagar: { type: Number, default: 0 }, // Deuda que tenemos con él
    topeMaximo: { type: Number, default: 1000000 } // Tope para el semáforo
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: { type: String, uppercase: true }, 
    compra: Number, 
    pago: Number, 
    metodo: String, 
    destino: { type: String, uppercase: true }, 
    fecha: { type: Date, default: Date.now },
    esGasto: { type: Boolean, default: false },
    detalleGasto: String,
    // Auditoría de Borrado (Fila Negra)
    esBorrado: { type: Boolean, default: false },
    fechaBorrado: Date,
    usuarioBorrado: String
}));

// --- SISTEMA DE 3 LLAVES (LOGIN UNIFICADO) ---
app.post('/api/login', (req, res) => {
    const { usuario, clave } = req.body;
    const u = usuario.toUpperCase();

    // 1. NIVEL VENDEDOR (Caja Ciega)
    if (u === 'LOCAL' && clave === '1234') {
        return res.json({ ok: true, rol: 'EMPLEADO', nombre: 'VENDEDOR' });
    }
    // 2. NIVEL DUEÑO (Control Total)
    if (u === 'ADMIN' && clave === 'DUENO2026') { // Cambiar por la clave real de Félix
        return res.json({ ok: true, rol: 'DUENO', nombre: 'ADMINISTRADOR' });
    }
    // 3. NIVEL PROVEEDOR (Tú - Backup y Auditoría)
    if (u === 'MOISES' && clave === 'MASTERKEY') { // Tu clave secreta
        return res.json({ ok: true, rol: 'DEV', nombre: 'SOPORTE TÉCNICO' });
    }

    res.status(401).json({ ok: false, msg: 'Acceso Denegado' });
});

// --- RUTAS API ---

// Clientes
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
    if (!c) c = await Cliente.create({ nombre: nombre.toUpperCase() });
    res.json(c);
});

// Operaciones (Venta y Cobro Inteligente)
app.post('/api/operaciones', async (req, res) => {
    const { clienteId, compra, pago, metodo, receptorId } = req.body;
    
    const cli = await Cliente.findById(clienteId);
    if (!cli) return res.status(404).json({error: "Cliente no encontrado"});

    // Lógica Autocobro: Si paga de más, baja deuda vieja
    const saldoOperacion = compra - pago; 
    cli.deuda += saldoOperacion; 
    await cli.save();

    // Proveedores (Si es transferencia)
    let nombreDestino = "";
    if (metodo === 'TRANSFERENCIA' && pago > 0 && receptorId) {
        const rec = await Receptor.findById(receptorId);
        if (rec) {
            // Bajamos la deuda con el proveedor porque le pagamos
            rec.saldoPorPagar -= pago; 
            if(rec.saldoPorPagar < 0) rec.saldoPorPagar = 0; // Evitar negativos locos
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

// Anulación (FILA NEGRA)
app.post('/api/operaciones/anular', async (req, res) => {
    const { idOperacion, usuario } = req.body;
    
    const op = await Operacion.findById(idOperacion);
    if (!op) return res.status(404).json({error: "No existe"});

    // Marcar como borrado (No se elimina de la BD)
    op.esBorrado = true;
    op.fechaBorrado = new Date();
    op.usuarioBorrado = usuario;
    await op.save();

    // NOTA: No devolvemos saldo a Receptor (tu regla de "No molestar al proveedor")
    // Pero si afectará la caja del día si era Efectivo (al restar en el reporte).

    res.json({ ok: true });
});

// Caja y Reportes
app.get('/api/caja-hoy', async (req, res) => {
    const inicio = new Date(); inicio.setHours(0,0,0,0);
    const ops = await Operacion.find({ fecha: { $gte: inicio } }).sort({ fecha: -1 });
    
    let totalVenta = 0;
    let efectivo = 0;
    let tarjeta = 0;
    let transf = 0;
    let gastos = 0;

    ops.forEach(o => {
        if (!o.esBorrado) { // Solo sumar si NO está borrado
            if (o.esGasto) {
                gastos += o.pago;
                if(o.metodo === 'EFECTIVO') efectivo -= o.pago;
            } else {
                totalVenta += o.compra;
                if(o.metodo === 'EFECTIVO') efectivo += o.pago;
                if(o.metodo === 'TARJETA') tarjeta += o.pago;
                if(o.metodo === 'TRANSFERENCIA') transf += o.pago;
            }
        }
    });

    res.json({ 
        totales: { totalVenta, efectivo, tarjeta, transf, gastos },
        movimientos: ops // Enviamos TODO (incluso borrados) para que el front los pinte de negro
    });
});

// Receptores (Proveedores)
app.get('/api/receptores', async (req, res) => {
    const list = await Receptor.find().sort({nombre: 1});
    res.json(list);
});

app.post('/api/receptores', async (req, res) => {
    const { nombre, alias } = req.body;
    let r = await Receptor.findOne({ nombre: nombre.toUpperCase() });
    if (!r) {
        // Creamos con deuda 0 inicial
        await new Receptor({ nombre: nombre.toUpperCase(), alias }).save();
    }
    res.json({ ok: true });
});

// BACKUP ENCRIPTADO (Simulado para descarga)
app.get('/api/backup/download', async (req, res) => {
    const clientes = await Cliente.find();
    const ops = await Operacion.find();
    const receptores = await Receptor.find();
    
    const data = JSON.stringify({ fecha: new Date(), clientes, ops, receptores });
    // Encriptación simple (Base64) para que no sea legible a simple vista
    const encriptado = Buffer.from(data).toString('base64'); 
    
    res.setHeader('Content-disposition', 'attachment; filename=BACKUP_SEGURIDAD_ENCRIPTADO.enc');
    res.setHeader('Content-type', 'text/plain');
    res.send(encriptado);
});

// Servidor Estático
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));
