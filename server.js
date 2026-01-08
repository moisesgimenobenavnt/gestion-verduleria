require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI);

// MODELOS CON HORA EXACTA
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    nombre: String, 
    telefono: String, 
    deuda: { type: Number, default: 0 } 
}));

const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: String, 
    montoObjetivo: Number, 
    saldoRestante: Number 
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: String, 
    compra: Number, 
    pago: Number, 
    metodo: String, 
    destino: String, 
    fecha: { type: Date, default: Date.now } 
}));

// API
app.get('/api/sugerencias/:query', async (req, res) => {
    const q = req.params.query;
    res.json(await Cliente.find({ $or: [{nombre: new RegExp(q,'i')}, {telefono: new RegExp(q,'i')}] }).limit(5).sort({nombre:1}));
});

app.get('/api/clientes/:val', async (req, res) => {
    const v = req.params.val.toUpperCase();
    let c = await Cliente.findOne({ $or: [{nombre: v}, {telefono: v}] });
    if (!c) c = await Cliente.create({ nombre: v, telefono: "", deuda: 0 });
    res.json(c);
});

app.post('/api/clientes/update-tel', async (req, res) => {
    const { id, telefono } = req.body;
    await Cliente.findByIdAndUpdate(id, { telefono });
    res.json({ ok: true });
});

app.get('/api/receptores', async (req, res) => res.json(await Receptor.find().sort({nombre:1})));

app.post('/api/receptores', async (req, res) => {
    const { nombre, monto } = req.body;
    const nuevo = new Receptor({ nombre: nombre.toUpperCase(), montoObjetivo: monto, saldoRestante: monto });
    await nuevo.save();
    res.json({ ok: true });
});

app.delete('/api/receptores/:id', async (req, res) => {
    await Receptor.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

app.get('/api/caja-hoy', async (req, res) => {
    const inicio = new Date(); inicio.setHours(0,0,0,0);
    const ops = await Operacion.find({ fecha: { $gte: inicio } });
    const totales = ops.reduce((acc, o) => {
        acc[o.metodo] = (acc[o.metodo] || 0) + o.pago;
        return acc;
    }, {EFECTIVO:0, TRANSFERENCIA:0, TARJETA:0});
    const deudores = ops.filter(o => o.compra > o.pago).map(o => ({ nombre: o.cliente, monto: o.compra - o.pago }));
    res.json({ totales, deudores });
});

app.post('/api/operaciones', async (req, res) => {
    const { cliente, compra, pago, metodo, destino } = req.body;
    await Cliente.findOneAndUpdate({ nombre: cliente }, { $inc: { deuda: (compra - pago) } });
    if (metodo === 'TRANSFERENCIA' && pago > 0) {
        await Receptor.findOneAndUpdate({ nombre: destino }, { $inc: { saldoRestante: -pago } });
    }
    await new Operacion(req.body).save();
    res.json({ ok: true });
});

app.get('/api/historial/:nombre', async (req, res) => {
    res.json(await Operacion.find({ cliente: req.params.nombre }).sort({ fecha: -1 }));
});

app.get('/api/historial-receptor/:nombre', async (req, res) => {
    res.json(await Operacion.find({ destino: req.params.nombre }).sort({ fecha: -1 }));
});

app.get('/api/exportar-backup', async (req, res) => {
    const c = await Cliente.find().sort({nombre:1});
    const r = await Receptor.find().sort({nombre:1});
    res.json({ clientes: c, receptores: r, backup_fecha: new Date() });
});

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

app.listen(process.env.PORT || 10000);
