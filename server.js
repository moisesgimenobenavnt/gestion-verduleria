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
const Receptor = mongoose.model('Receptor', new mongoose.Schema({ nombre: String, saldo: Number }));
const Operacion = mongoose.model('Operacion', new mongoose.Schema({ cliente: String, compra: Number, pago: Number, metodo: String, destino: String, fecha: { type: Date, default: Date.now } }));

app.get('/api/sugerencias/:query', async (req, res) => {
    res.json(await Cliente.find({ nombre: new RegExp(req.params.query,'i') }).limit(5));
});

app.get('/api/clientes/:nombre', async (req, res) => {
    const n = req.params.nombre.toUpperCase();
    let c = await Cliente.findOne({ nombre: n });
    if (!c) c = await Cliente.create({ nombre: n, deuda: 0 });
    res.json(c);
});

app.get('/api/receptores', async (req, res) => res.json(await Receptor.find().sort({nombre:1})));
app.post('/api/receptores', async (req, res) => res.json(await new Receptor(req.body).save()));
app.delete('/api/receptores/:id', async (req, res) => res.json(await Receptor.findByIdAndDelete(req.params.id)));

app.get('/api/caja-hoy', async (req, res) => {
    const inicio = new Date(); inicio.setHours(0,0,0,0);
    const ops = await Operacion.find({ fecha: { $gte: inicio } });
    
    const totales = ops.reduce((acc, o) => {
        acc[o.metodo] = (acc[o.metodo] || 0) + o.pago;
        return acc;
    }, {EFECTIVO:0, TRANSFERENCIA:0, TARJETA:0});

    // Filtramos deudores de hoy (gente que compró más de lo que pagó hoy)
    const deudoresHoy = ops.filter(o => o.compra > o.pago).map(o => ({
        nombre: o.cliente,
        monto: o.compra - o.pago
    }));

    res.json({ totales, deudores: deudoresHoy });
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
    let csv = "Nombre,Deuda\n";
    c.forEach(x => csv += `${x.nombre},${x.deuda}\n`);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment('backup.csv');
    res.send(csv);
});

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

app.listen(process.env.PORT || 10000);
