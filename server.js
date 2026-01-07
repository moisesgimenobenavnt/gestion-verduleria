const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

let db;
const client = new MongoClient(process.env.MONGO_URI);

async function conectarDB() {
    try {
        await client.connect();
        db = client.db('verdureria');
        console.log("✅ Servidor vinculado a MongoDB");
    } catch (error) { console.error("❌ Error de conexión:", error.message); }
}
conectarDB();

// --- RUTAS DE PROVEEDORES ---
app.get('/api/proveedores', async (req, res) => {
    try {
        const provs = await db.collection('proveedores').find().toArray();
        res.json(provs);
    } catch (error) { res.status(500).json([]); }
});

app.post('/api/proveedores/ajuste', async (req, res) => {
    const { nombre, monto, motivo } = req.body;
    const fecha = new Date();
    const montoNum = parseFloat(monto);
    await db.collection('proveedores').updateOne(
        { nombre: nombre.toUpperCase() },
        { 
            $inc: { saldoDeuda: montoNum },
            $push: { historial: { fecha, detalle: motivo || "Ajuste manual", movimiento: montoNum } }
        },
        { upsert: true }
    );
    res.json({ message: "OK" });
});

// --- RUTAS DE CLIENTES Y OPERACIONES ---
app.get('/api/sugerencias/:busqueda', async (req, res) => {
    try {
        const texto = req.params.busqueda.toUpperCase();
        const sugerencias = await db.collection('clientes').find({
            $or: [{ nombre: { $regex: '^' + texto } }, { telefono: { $regex: texto } }]
        }).limit(10).toArray();
        res.json(sugerencias);
    } catch (error) { res.status(500).json([]); }
});

app.get('/api/clientes/:nombre', async (req, res) => {
    try {
        const nombre = req.params.nombre.toUpperCase();
        let cliente = await db.collection('clientes').findOne({ nombre });
        if (!cliente) {
            cliente = { nombre, telefono: "", deuda: 0 };
            await db.collection('clientes').insertOne(cliente);
        }
        res.json(cliente);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/operaciones', async (req, res) => {
    try {
        const { cliente, compra, pago, metodo, destino, fecha } = req.body;
        const fechaFinal = new Date(fecha + "T12:00:00");
        const pagoNum = parseFloat(pago);

        // 1. Registro movimiento
        await db.collection('movimientos').insertOne({ cliente, compra, pago: pagoNum, metodo, destino, fecha: fechaFinal });
        
        // 2. Actualizar deuda cliente
        await db.collection('clientes').updateOne({ nombre: cliente }, { $inc: { deuda: (compra - pagoNum) } });

        // 3. Si es Transferencia, descontar de la deuda al proveedor
        if (metodo === 'TRANSFERENCIA' && destino !== 'GENERAL') {
            await db.collection('proveedores').updateOne(
                { nombre: destino.toUpperCase() },
                { 
                    $inc: { saldoDeuda: -pagoNum },
                    $push: { historial: { fecha: fechaFinal, detalle: `Pago de cliente: ${cliente}`, movimiento: -pagoNum } }
                }
            );
        }
        res.json({ message: "OK" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/deudores', async (req, res) => {
    try {
        const deudores = await db.collection('clientes').find({ deuda: { $gt: 0 } }).sort({ deuda: -1 }).toArray();
        res.json(deudores);
    } catch (error) { res.status(500).json([]); }
});

app.get('/api/reporte', async (req, res) => {
    const { inicio, fin } = req.query;
    try {
        const fInicio = new Date(inicio + "T00:00:00");
        const fFin = new Date(fin + "T23:59:59");
        const movimientos = await db.collection('movimientos').find({ fecha: { $gte: fInicio, $lte: fFin } }).toArray();
        res.json(movimientos);
    } catch (error) { res.status(500).json([]); }
});

app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));