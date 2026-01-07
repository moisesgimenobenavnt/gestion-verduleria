require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión:", err));

// Esquema de Clientes
const clienteSchema = new mongoose.Schema({
    nombre: { type: String, unique: true, uppercase: true },
    telefono: String,
    deuda: { type: Number, default: 0 }
});
const Cliente = mongoose.model('Cliente', clienteSchema);

// Esquema de Proveedores/Terceros
const proveedorSchema = new mongoose.Schema({
    nombre: { type: String, unique: true, uppercase: true },
    saldoDeuda: { type: Number, default: 0 },
    historial: [{ fecha: Date, detalle: String, movimiento: Number }]
});
const Proveedor = mongoose.model('Proveedor', proveedorSchema);

// Esquema de Operaciones
const operacionSchema = new mongoose.Schema({
    cliente: String,
    compra: Number,
    pago: Number,
    metodo: String,
    destino: String,
    fecha: Date
});
const Operacion = mongoose.model('Operacion', operacionSchema);

// --- RUTAS API ---

app.get('/api/sugerencias/:query', async (req, res) => {
    const regex = new RegExp(req.params.query, 'i');
    const sugerencias = await Cliente.find({ $or: [{ nombre: regex }, { telefono: regex }] }).limit(5);
    res.json(sugerencias);
});

app.get('/api/clientes/:nombre', async (req, res) => {
    let c = await Cliente.findOne({ nombre: req.params.nombre.toUpperCase() });
    if (!c) c = await Cliente.create({ nombre: req.params.nombre.toUpperCase(), deuda: 0 });
    res.json(c);
});

app.post('/api/operaciones', async (req, res) => {
    const { cliente, compra, pago, metodo, destino, fecha } = req.body;
    
    // 1. Actualizar Deuda Cliente
    const diff = compra - pago;
    await Cliente.findOneAndUpdate({ nombre: cliente }, { $inc: { deuda: diff } });

    // 2. Si es transferencia a proveedor, descontar de su deuda
    if (metodo === 'TRANSFERENCIA' && destino !== 'GENERAL') {
        await Proveedor.findOneAndUpdate(
            { nombre: destino },
            { 
                $inc: { saldoDeuda: -pago },
                $push: { historial: { fecha, detalle: `Pago de ${cliente}`, movimiento: -pago } }
            }
        );
    }

    const nuevaOp = new Operacion(req.body);
    await nuevaOp.save();
    res.json({ status: "ok" });
});

app.get('/api/proveedores', async (req, res) => {
    const provs = await Proveedor.find();
    res.json(provs);
});

app.post('/api/proveedores/ajuste', async (req, res) => {
    const { nombre, monto, motivo } = req.body;
    const p = await Proveedor.findOneAndUpdate(
        { nombre: nombre.toUpperCase() },
        { 
            $inc: { saldoDeuda: monto },
            $push: { historial: { fecha: new Date(), detalle: motivo, movimiento: monto } }
        },
        { upsert: true, new: true }
    );
    res.json(p);
});

app.get('/api/reporte', async (req, res) => {
    const { inicio, fin } = req.query;
    const ops = await Operacion.find({
        fecha: { $gte: new Date(inicio), $lte: new Date(fin) }
    });
    res.json(ops);
});

app.delete('/api/clientes/:nombre', async (req, res) => {
    await Cliente.findOneAndDelete({ nombre: req.params.nombre });
    res.json({ status: "eliminado" });
});

// --- SERVIR FRONTEND ---
const path = require('path');
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// CONFIGURACIÓN PARA RENDER (IMPORTANTE)
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor funcionando en puerto ${PORT}`);
});
