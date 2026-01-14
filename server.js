require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONEXIÓN BASE DE DATOS ---
// Si no hay .env, usa local por defecto
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verduleria_blindada';
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch(err => console.error("❌ Error Mongo:", err));

// --- MODELOS ---
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true }, 
    telefono: { type: String, default: "" }, 
    deuda: { type: Number, default: 0 } 
}));

// Receptor ahora representa un PROVEEDOR o CUENTA TERCERO a quien LE DEBEMOS
const Receptor = mongoose.model('Receptor', new mongoose.Schema({ 
    nombre: { type: String, uppercase: true, unique: true }, 
    alias: { type: String, default: "" },
    deudaOriginal: { type: Number, default: 0 }, // Lo que le debíamos inicialmente
    saldoPorPagar: { type: Number, default: 0 }  // Lo que falta pagarle (va bajando)
}));

const Operacion = mongoose.model('Operacion', new mongoose.Schema({ 
    cliente: { type: String, uppercase: true }, 
    compra: Number, 
    pago: Number, 
    metodo: String, 
    destino: { type: String, uppercase: true }, // Nombre del Receptor
    fecha: { type: Date, default: Date.now },
    esGasto: { type: Boolean, default: false },
    detalleGasto: String
}));

// --- RUTAS API ---

// 1. LOGIN SEGURO (Las claves están aquí, no en el HTML)
app.post('/api/login', (req, res) => {
    const { id, pass } = req.body;
    // Usuarios HARDCODEADOS en servidor (Más seguro que en HTML)
    if (id === 'ADMIN' && pass === 'admin2026') {
        return res.json({ ok: true, usuario: { nombre: 'ADMINISTRADOR', tipo: 'DUENO' } });
    }
    if (id === 'LOCAL1' && pass === 'caja1') {
        return res.json({ ok: true, usuario: { nombre: 'CAJERO', tipo: 'EMPLEADO' } });
    }
    res.status(401).json({ ok: false, msg: 'Credenciales Incorrectas' });
});

// 2. CLIENTES
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

app.post('/api/clientes/update-tel', async (req, res) => {
    const { id, telefono } = req.body;
    await Cliente.findByIdAndUpdate(id, { telefono });
    res.json({ ok: true });
});

// 3. OPERACIONES (VENTA Y PAGO)
app.post('/api/operaciones', async (req, res) => {
    const { clienteId, compra, pago, metodo, receptorId } = req.body;
    
    // Buscar Cliente
    const cli = await Cliente.findById(clienteId);
    if (!cli) return res.status(404).json({error: "Cliente no encontrado"});

    // Actualizar Deuda Cliente
    const nuevaDeuda = (compra - pago);
    cli.deuda += nuevaDeuda;
    await cli.save();

    // Actualizar Receptor (Si es transferencia, bajamos nuestra deuda con el proveedor)
    let nombreDestino = "";
    if (metodo === 'TRANSFERENCIA' && pago > 0 && receptorId) {
        const rec = await Receptor.findById(receptorId);
        if (rec) {
            rec.saldoPorPagar -= pago; // Restamos lo que le debemos
            await rec.save();
            nombreDestino = rec.nombre;
        }
    }

    // Guardar Operación
    const op = new Operacion({
        cliente: cli.nombre,
        compra, pago, metodo,
        destino: nombreDestino,
        esGasto: false
    });
    await op.save();

    res.json({ ok: true, cliente: cli });
});

// 4. GASTOS
app.post('/api/gastos', async (req, res) => {
    const { detalle, monto, metodo } = req.body;
    await new Operacion({
        cliente: "GASTO INTERNO",
        compra: 0, pago: monto,
        metodo, detalleGasto: detalle, esGasto: true
    }).save();
    res.json({ ok: true });
});

// 5. RECEPTORES (Pasamanos / Deudas Proveedores)
app.get('/api/receptores', async (req, res) => {
    const list = await Receptor.find().sort({nombre: 1});
    res.json(list);
});

app.post('/api/receptores', async (req, res) => {
    const { nombre, alias, montoDeuda } = req.body; // montoDeuda es lo que debemos pagar
    const n = nombre.toUpperCase();
    
    let r = await Receptor.findOne({ nombre: n });
    if (r) {
        // Si ya existe, sumamos más deuda
        r.deudaOriginal += parseFloat(montoDeuda);
        r.saldoPorPagar += parseFloat(montoDeuda);
        if(alias) r.alias = alias;
        await r.save();
    } else {
        await new Receptor({ 
            nombre: n, 
            alias, 
            deudaOriginal: montoDeuda, 
            saldoPorPagar: montoDeuda 
        }).save();
    }
    res.json({ ok: true });
});

app.post('/api/receptores/vaciar', async (req, res) => {
    const { id } = req.body;
    // Resetear a 0 (por si se pagó todo manual o error)
    await Receptor.findByIdAndUpdate(id, { saldoPorPagar: 0 });
    res.json({ ok: true });
});

// 6. CAJA DIARIA Y BACKUP SILENCIOSO
app.get('/api/caja-hoy', async (req, res) => {
    const inicio = new Date();
    inicio.setHours(0,0,0,0);
    
    const ops = await Operacion.find({ fecha: { $gte: inicio } });
    
    // Totales
    let ventaTotal = 0;
    let efectivoMano = 0; // Solo lo que entra en billetes y queda en cajón
    let tarjeta = 0;
    let transf = 0;
    let gastos = 0;

    ops.forEach(o => {
        if (o.esGasto) {
            gastos += o.pago;
            if (o.metodo === 'EFECTIVO') efectivoMano -= o.pago; // Gasto saca plata del cajón
        } else {
            ventaTotal += o.compra; // Lo que se vendió (independiente de si pagaron)
            
            if (o.metodo === 'EFECTIVO') efectivoMano += o.pago;
            if (o.metodo === 'TARJETA') tarjeta += o.pago;
            if (o.metodo === 'TRANSFERENCIA') transf += o.pago;
        }
    });

    res.json({
        totales: { ventaTotal, efectivoMano, tarjeta, transf, gastos },
        movimientos: ops.reverse() // Lo más nuevo arriba
    });
    
    // --- BACKUP SILENCIOSO ---
    // Cada vez que consultan la caja (frecuente), guardamos un JSON en carpeta local
    generateSilentBackup(); 
});

// Listados Deudores
app.get('/api/deudores', async (req, res) => {
    const deudores = await Cliente.find({ deuda: { $gt: 10 } }).sort({ deuda: -1 });
    res.json(deudores);
});


// Función Helper Backup
async function generateSilentBackup() {
    try {
        const backupDir = path.join(__dirname, 'backups_ocultos');
        if (!fs.existsSync(backupDir)){
            fs.mkdirSync(backupDir);
        }
        
        const clientes = await Cliente.find();
        const receptores = await Receptor.find();
        const operaciones = await Operacion.find();

        const data = JSON.stringify({ fecha: new Date(), clientes, receptores, operaciones }, null, 2);
        const filename = `backup_${new Date().toISOString().slice(0,10)}.json`;
        
        fs.writeFileSync(path.join(backupDir, filename), data);
        // Console log discreto
        // console.log("💾 Backup Silencioso Generado: " + filename);
    } catch (e) {
        console.error("Error Backup:", e);
    }
}


// Servir Archivos Estáticos
app.use(express.static(__dirname));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVIDOR LISTO EN PUERTO ${PORT}`));
