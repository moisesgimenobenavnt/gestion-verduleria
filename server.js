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
    nombre: String, telefono: String, deuda: { type: Number, default: 0 } 
}));

const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true }, montoObjetivo: Number, saldoRestante: Number 
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: String, compra: Number, pago: Number, metodo: String, destino: String, fecha: { type: Date, default: Date.now }, deudaMomento: Number
}));

// API CLIENTES
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

app.post('/api/operaciones', async (req, res) => {
    const { cliente, compra, pago, metodo, destino } = req.body;
    const c = await Cliente.findOneAndUpdate({ nombre: cliente }, { $inc: { deuda: (compra - pago) } }, { new: true });
    if (metodo === 'TRANSFERENCIA' && pago > 0) {
        await Receptor.findOneAndUpdate({ nombre: destino }, { $inc: { saldoRestante: -pago } });
    }
    const op = new Operacion({ ...req.body, deudaMomento: c.deuda });
    await op.save();
    res.json({ ok: true });
});

// API RECEPTORES (PROVEEDORES)
app.get('/api/receptores', async (req, res) => res.json(await Receptor.find().sort({nombre:1})));

app.post('/api/receptores', async (req, res) => {
    const { nombre, monto } = req.body;
    const exist = await Receptor.findOne({ nombre: nombre.toUpperCase() });
    if (exist) {
        exist.montoObjetivo += parseFloat(monto);
        exist.saldoRestante += parseFloat(monto);
        await exist.save();
    } else {
        await new Receptor({ nombre: nombre.toUpperCase(), montoObjetivo: monto, saldoRestante: monto }).save();
    }
    res.json({ ok: true });
});

app.delete('/api/receptores/:id', async (req, res) => { res.json(await Receptor.findByIdAndDelete(req.params.id)); });

app.get('/api/caja-hoy', async (req, res) => {
    const inicio = new Date(); inicio.setHours(0,0,0,0);
    const ops = await Operacion.find({ fecha: { $gte: inicio } });
    const totales = ops.reduce((acc, o) => {
        acc[o.metodo] = (acc[o.metodo] || 0) + o.pago;
        return acc;
    }, {EFECTIVO:0, TRANSFERENCIA:0, TARJETA:0});
    
    // Solo deudores activos (deuda > 0)
    const clientesHoy = [...new Set(ops.map(o => o.cliente))];
    const deudores = [];
    for(let nom of clientesHoy) {
        const c = await Cliente.findOne({ nombre: nom });
        if(c && c.deuda > 0) deudores.push({ nombre: c.nombre, monto: c.deuda });
    }
    res.json({ totales, deudores });
});

app.get('/api/historial/:nombre', async (req, res) => {
    res.json(await Operacion.find({ cliente: req.params.nombre }).sort({ fecha: -1 }));
});

app.get('/api/historial-receptor/:nombre', async (req, res) => {
    res.json(await Operacion.find({ destino: req.params.nombre }).sort({ fecha: -1 }));
});

app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));
app.listen(process.env.PORT || 10000);
