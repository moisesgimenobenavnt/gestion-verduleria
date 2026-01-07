require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI);

const Cliente = mongoose.model('Cliente', new mongoose.Schema({ nombre: String, telefono: String, deuda: Number }));
const Receptor = mongoose.model('Receptor', new mongoose.Schema({ nombre: String, saldo: Number }));
const Operacion = mongoose.model('Operacion', new mongoose.Schema({ cliente: String, compra: Number, pago: Number, metodo: String, destino: String, fecha: { type: Date, default: Date.now } }));

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

app.get('/api/receptores', async (req, res) => res.json(await Receptor.find().sort({nombre:1})));

app.post('/api/receptores', async (req, res) => { res.json(await new Receptor(req.body).save()); });

app.delete('/api/receptores/:id', async (req, res) => { res.json(await Receptor.findByIdAndDelete(req.params.id)); });

app.get('/api/caja-hoy', async (req, res) => {
    const inicio = new Date(); inicio.setHours(0,0,0,0);
    const ops = await Operacion.find({ fecha: { $gte: inicio } });
    const caja = ops.reduce((acc, o) => {
        acc[o.metodo] = (acc[o.metodo] || 0) + o.pago;
        acc['PENDIENTE'] = (acc['PENDIENTE'] || 0) + (o.compra - o.pago);
        return acc;
    }, {EFECTIVO:0, TRANSFERENCIA:0, TARJETA:0, PENDIENTE:0});
    res.json(caja);
});

app.post('/api/operaciones', async (req, res) => {
    const { cliente, compra, pago, metodo, destino } = req.body;
    await Cliente.findOneAndUpdate({ nombre: cliente }, { $inc: { deuda: (compra - pago) } });
    if (metodo === 'TRANSFERENCIA' && pago > 0) {
        await Receptor.findOneAndUpdate({ nombre: destino }, { $inc: { saldo: -pago } });
    }
    await new Operacion(req.body).save();
    res.json({ ok: true });
});

app.get('/api/historial/:nombre', async (req, res) => {
    res.json(await Operacion.find({ cliente: req.params.nombre }).sort({ fecha: -1 }));
});

app.get('/api/exportar-clientes', async (req, res) => {
    const c = await Cliente.find().sort({nombre:1});
    let csv = "Nombre,Telefono,Deuda\n";
    c.forEach(x => csv += `${x.nombre},${x.telefono},${x.deuda}\n`);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment('backup.csv');
    res.send(csv);
});

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

app.listen(process.env.PORT || 10000);
