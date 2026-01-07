require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI);

const Cliente = mongoose.model('Cliente', new mongoose.Schema({ nombre: String, deuda: Number }));
const Receptor = mongoose.model('Receptor', new mongoose.Schema({ nombre: String, saldoDeuda: Number }));
const Operacion = mongoose.model('Operacion', new mongoose.Schema({ cliente: String, compra: Number, pago: Number, metodo: String, destino: String, fecha: Date }));

app.get('/api/sugerencias/:query', async (req, res) => {
    res.json(await Cliente.find({ nombre: new RegExp(req.params.query, 'i') }).limit(5));
});

app.get('/api/clientes/:nombre', async (req, res) => {
    let c = await Cliente.findOne({ nombre: req.params.nombre.toUpperCase() });
    if (!c) c = await Cliente.create({ nombre: req.params.nombre.toUpperCase(), deuda: 0 });
    res.json(c);
});

app.get('/api/historial/:nombre', async (req, res) => {
    res.json(await Operacion.find({ cliente: req.params.nombre }).sort({ fecha: -1 }));
});

app.get('/api/proveedores', async (req, res) => {
    res.json(await Receptor.find());
});

app.post('/api/operaciones', async (req, res) => {
    const { cliente, compra, pago, metodo, destino } = req.body;
    await Cliente.findOneAndUpdate({ nombre: cliente }, { $inc: { deuda: (compra - pago) } });
    if (metodo === 'TRANSFERENCIA' && pago > 0) {
        await Receptor.findOneAndUpdate({ nombre: destino }, { $inc: { saldoDeuda: -pago } });
    }
    await new Operacion(req.body).save();
    res.json({ status: "ok" });
});

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

app.listen(process.env.PORT || 10000);
