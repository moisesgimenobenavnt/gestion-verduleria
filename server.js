// ================================================================
// SERVIDOR "VISIÓN MOISÉS V5" - BACKEND BLINDADO
// PUERTO: 3001 (Configurado para evitar choques)
// ================================================================

// 1. CARGA DE MÓDULOS (HERRAMIENTAS)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// 2. CONFIGURACIÓN DEL SERVIDOR
const app = express();
const PORT = 3001; // <--- AQUÍ ESTÁ EL CAMBIO IMPORTANTE

// Middleware (Permisos de seguridad)
app.use(cors()); // Permite que el HTML (tu cara) hable con el Servidor (tu cerebro)
app.use(bodyParser.json()); // Permite recibir datos complejos

// 3. CONEXIÓN A LA BASE DE DATOS (HONGO DB)
// IMPORTANTE: Si subes esto a la nube (Render/Glitch), deberás cambiar esta línea
// por la dirección de tu MongoDB Atlas (Nube). Por ahora, lo dejo en Local para tus pruebas.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verduleria_vision_moises';

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log("--------------------------------------------------");
    console.log("✅ CONEXIÓN EXITOSA AL HONGO DB (PERSISTENCIA ACTIVADA)");
    console.log("💾 SISTEMA DE SEGURIDAD: ONLINE");
    console.log("--------------------------------------------------");
})
.catch(err => {
    console.error("❌ ERROR CRÍTICO: NO SE DETECTA LA BASE DE DATOS.");
    console.error(err);
});

// ================================================================
// 4. ESQUEMAS DE SEGURIDAD (HUELLA FORENSE)
// ================================================================

// A. ESQUEMA DE MOVIMIENTOS (Historial inborrable)
const MovimientoSchema = new mongoose.Schema({
    tipo: { type: String, required: true }, // VENTA, GASTO, RETIRO, CIERRE
    monto: { type: Number, required: true },
    
    // Auditoría de Seguridad (Quién y Cuándo)
    usuarioRegistra: { type: String, required: true }, // Ej: VENDEDOR
    responsableFisico: { type: String, default: "-" }, // Ej: JUAN
    
    // Datos Operativos
    cliente: { type: String, default: "-" },
    pagoReal: { type: Number, default: 0 }, // Efectivo real en caja
    destinoFondos: { type: String, default: "CAJA" }, // CAJA, BANCO, ETC.
    
    // Sellos de Tiempo (String para visualización, Date para orden)
    fecha: { type: String }, 
    hora: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// B. ESQUEMA DE CLIENTES (Gestión de Deuda)
const ClienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true, uppercase: true },
    telefono: { type: String, default: "" },
    deudaActual: { type: Number, default: 0 }, // SALDO ROJO
    ultimaActualizacion: { type: Date, default: Date.now },
    historial: [Object] // Rastro de cambios
});

// Modelos
const Movimiento = mongoose.model('Movimiento', MovimientoSchema);
const Cliente = mongoose.model('Cliente', ClienteSchema);

// ================================================================
// 5. RUTAS DE LA API (CONEXIÓN CON HTML)
// ================================================================

// --- RUTA 1: GUARDAR MOVIMIENTOS (Seguridad Máxima) ---
app.post('/api/movimientos', async (req, res) => {
    try {
        const nuevoMov = new Movimiento(req.body);
        await nuevoMov.save(); // <--- AQUÍ SE GRABA EN EL DISCO DURO
        
        console.log(`📝 [${nuevoMov.fecha} ${nuevoMov.hora}] GUARDADO: ${nuevoMov.tipo} $${nuevoMov.monto}`);
        res.json({ ok: true, mensaje: "GUARDADO EN DB" });
    } catch (error) {
        console.error("Error al guardar:", error);
        res.status(500).json({ ok: false, error: "Fallo de escritura en disco" });
    }
});

// --- RUTA 2: LEER HISTORIAL (Para Auditoría U2) ---
app.get('/api/movimientos', async (req, res) => {
    try {
        // Devuelve los últimos 300 movimientos para auditoría rápida
        const lista = await Movimiento.find().sort({ timestamp: -1 }).limit(300);
        res.json(lista);
    } catch (error) {
        res.status(500).json({ ok: false, error: "Error de lectura" });
    }
});

// --- RUTA 3: CLIENTES (Buscador Predictivo) ---
app.get('/api/clientes/:query', async (req, res) => {
    const q = req.params.query;
    try {
        const resultados = await Cliente.find({ 
            nombre: { $regex: q, $options: 'i' } 
        }).limit(10);
        res.json(resultados);
    } catch (error) {
        res.status(500).json([]);
    }
});

// --- RUTA 4: LISTAR DEUDORES (Ranking Morosos) ---
app.get('/api/clientes', async (req, res) => {
    try {
        const todos = await Cliente.find();
        res.json(todos);
    } catch (error) {
        res.status(500).json([]);
    }
});

// --- RUTA 5: ACTUALIZAR DEUDA (Gestión Financiera) ---
app.post('/api/clientes', async (req, res) => {
    const { nombre, deuda, telefono } = req.body;
    try {
        let cliente = await Cliente.findOne({ nombre: nombre });
        
        if (cliente) {
            // Actualizar existente
            cliente.deudaActual = deuda; 
            if(telefono) cliente.telefono = telefono;
            cliente.ultimaActualizacion = new Date();
            
            // Historial interno del cliente
            cliente.historial.push({
                fecha: new Date().toLocaleString(),
                saldo: deuda,
                accion: "ACTUALIZACIÓN SISTEMA"
            });
            await cliente.save();
        } else {
            // Crear nuevo
            cliente = new Cliente({ 
                nombre, 
                telefono, 
                deudaActual: deuda,
                historial: [{
                    fecha: new Date().toLocaleString(),
                    saldo: deuda,
                    accion: "ALTA CLIENTE"
                }]
            });
            await cliente.save();
        }
        res.json({ ok: true, cliente });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTA 6: EL VEREDICTO (Cálculo Matemático Servidor) ---
app.post('/api/veredicto', async (req, res) => {
    try {
        const movimientos = await Movimiento.find();
        
        let ventas = 0;
        let gastos = 0;
        let retiros = 0;
        let cajaFisica = 0;

        movimientos.forEach(m => {
            // 1. Sumar Ventas
            if(m.tipo === "VENTA") {
                ventas += m.monto;
                if(m.destinoFondos === "CAJA") cajaFisica += (m.pagoReal || 0);
            }
            // 2. Restar Gastos
            if(m.tipo === "GASTO") {
                gastos += m.monto;
                cajaFisica -= m.monto;
            }
            // 3. Controlar Retiros
            if(m.tipo.includes("RETIRO") || m.tipo.includes("CIERRE")) {
                retiros += m.monto;
                cajaFisica -= m.monto;
            }
        });

        const gananciaNeta = ventas - gastos;

        res.json({
            gananciaNeta: gananciaNeta,
            ventas: ventas,
            gastos: gastos,
            diferenciaCaja: cajaFisica
        });

    } catch (error) {
        res.status(500).json({ error: "Error de cálculo" });
    }
});

// ================================================================
// 6. ENCENDIDO DEL SISTEMA
// ================================================================
app.listen(PORT, () => {
    console.log(" ");
    console.log("██████████████████████████████████████████████████");
    console.log("█  SISTEMA VISIÓN MOISÉS V5 - ALTA SEGURIDAD     █");
    console.log(`█  PUERTO ACTIVO: ${PORT}                           █`);
    console.log("█  ESTADO: ESPERANDO ÓRDENES DEL HTML...         █");
    console.log("██████████████████████████████████████████████████");
    console.log(" ");
});
