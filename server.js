require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => console.error("❌ Error de conexión MongoDB:", err));

const Cliente = mongoose.model('Cliente', new mongoose.Schema({
    nombre: { type: String, unique: true, uppercase: true },
    telefono: String,
    deuda: { type: Number, default: 0 }
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({
    cliente: String, compra: Number, pago: Number, metodo: String, fecha: String
}));

app.get('/api/sugerencias/:query', async (req, res) => {
    try {
        const sugerencias = await Cliente.find({ nombre: new RegExp(req.params.query, 'i') }).limit(5);
        res.json(sugerencias);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/clientes/:nombre', async (req, res) => {
    try {
        let c = await Cliente.findOne({ nombre: req.params.nombre.toUpperCase() });
        if (!c) c = await Cliente.create({ nombre: req.params.nombre.toUpperCase(), deuda: 0 });
        res.json(c);
    } catch (e) { res.status(500).json({ nombre: "Error", deuda: 0 }); }
});

app.post('/api/operaciones', async (req, res) => {
    try {
        const { cliente, compra, pago } = req.body;
        await Cliente.findOneAndUpdate({ nombre: cliente }, { $inc: { deuda: (compra - pago) } });
        await new Operacion(req.body).save();
        res.json({ status: "ok" });
    } catch (e) { res.status(500).json({ status: "error" }); }
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
