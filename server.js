require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI);

const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true }, 
    telefono: { type: String, default: "" }, 
    deuda: { type: Number, default: 0 } 
}));

const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true, unique: true }, 
    montoObjetivo: { type: Number, default: 0 }, 
    saldoRestante: { type: Number, default: 0 } 
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: { type: String, uppercase: true }, 
    compra: Number, 
    pago: Number, 
    metodo: String, 
    destino: { type: String, uppercase: true }, 
    fecha: { type: Date, default: Date.now },
    deudaCorte: Number
}));

app.get('/api/clientes/:val', async (req, res) => {
    const v = req.params.val.toUpperCase();
    let c = await Cliente.findOne({ $or: [{nombre: v}, {telefono: v}] });
    if (!c) c = await Cliente.create({ nombre: v, telefono: "", deuda: 0 });
    res.json(c);
});

app.post('/api/operaciones', async (req, res) => {
    const { cliente, compra, pago, metodo, destino } = req.body;
    const c = await Cliente.findOneAndUpdate({ nombre: cliente.toUpperCase() }, { $inc: { deuda: (compra - pago) } }, { new: true });
    if (metodo === 'TRANSFERENCIA' && pago > 0) {
        await Receptor.findOneAndUpdate({ nombre: destino.toUpperCase() }, { $inc: { saldoRestante: -pago } });
    }
    await new Operacion({...req.body, cliente: cliente.toUpperCase(), deudaCorte: c.deuda}).save();
    res.json({ ok: true });
});

app.get('/api/reporte-caja', async (req, res) => {
    const { desde, hasta } = req.query;
    const f1 = new Date(desde); f1.setHours(0,0,0,0);
    const f2 = new Date(hasta); f2.setHours(23,59,59,999);
    const ops = await Operacion.find({ fecha: { $gte: f1, $lte: f2 } });
    const totales = ops.reduce((acc, o) => { acc[o.metodo] = (acc[o.metodo] || 0) + o.pago; return acc; }, {EFECTIVO:0, TRANSFERENCIA:0, TARJETA:0});
    const deudores = await Cliente.find({ deuda: { $gt: 0 } }).sort({nombre:1});
    const totalDeudaGeneral = deudores.reduce((sum, d) => sum + d.deuda, 0);
    const receptores = await Receptor.find().sort({nombre:1});
    res.json({ totales, deudores, totalDeudaGeneral, receptores });
});

app.get('/api/historial/:nombre', async (req, res) => res.json(await Operacion.find({ cliente: req.params.nombre.toUpperCase() }).sort({ fecha: 1 })));
app.get('/api/historial-receptor/:nombre', async (req, res) => res.json(await Operacion.find({ destino: req.params.nombre.toUpperCase() }).sort({ fecha: 1 })));

app.delete('/api/operaciones/:id', async (req, res) => {
    const op = await Operacion.findById(req.params.id);
    if(op) {
        await Cliente.findOneAndUpdate({ nombre: op.cliente }, { $inc: { deuda: -(op.compra - op.pago) } });
        if(op.metodo === 'TRANSFERENCIA') await Receptor.findOneAndUpdate({ nombre: op.destino }, { $inc: { saldoRestante: op.pago } });
        await Operacion.findByIdAndDelete(req.params.id);
    }
    res.json({ ok: true });
});

app.post('/api/receptores', async (req, res) => {
    const { nombre, monto } = req.body;
    const n = nombre.toUpperCase();
    let r = await Receptor.findOne({ nombre: n });
    if (r) { r.montoObjetivo += parseFloat(monto); r.saldoRestante += parseFloat(monto); await r.save(); }
    else { await new Receptor({ nombre: n, montoObjetivo: monto, saldoRestante: monto }).save(); }
    res.json({ ok: true });
});

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
app.listen(process.env.PORT || 10000);
