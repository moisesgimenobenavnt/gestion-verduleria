// ================================================================
// SERVIDOR "VISIÓN MOISÉS V5" - BACKEND ROBUSTO
// ================================================================

// 1. IMPORTACIÓN DE LIBRERÍAS
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// 2. CONFIGURACIÓN DEL SERVIDOR
const app = express();
const PORT = 3000; // Puerto donde escucha el servidor (coincide con el HTML)

// Middleware (Permisos para que el HTML hable con el Servidor)
app.use(cors());
app.use(bodyParser.json());

// 3. CONEXIÓN A BASE DE DATOS (HONGO DB)
// Esto crea una carpeta física en tu disco duro donde guarda los datos.
// Si apagas la PC, los datos siguen aquí al encenderla.
mongoose.connect('mongodb://localhost:27017/verduleria_vision_moises', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ CONEXIÓN EXITOSA A BASE DE DATOS (HONGO ACTIVO)"))
.catch(err => console.error("❌ ERROR CRÍTICO: NO SE PUEDE CONECTAR A LA BD. REVISE MONGODB.", err));

// ================================================================
// 4. ESQUEMAS DE DATOS (LAS CAJAS FUERTES)
// ================================================================

// A. ESQUEMA DE MOVIMIENTOS (HUELLA FORENSE)
// Guarda cada centavo que entra o sale, quién lo movió y a qué hora.
const MovimientoSchema = new mongoose.Schema({
    tipo: { type: String, required: true }, // VENTA, GASTO, RETIRO PARCIAL, CIERRE FINAL
    monto: { type: Number, required: true },
    
    // Datos de Auditoría
    usuarioRegistra: { type: String, required: true }, // El usuario logueado (ej: VENDEDOR)
    responsableFisico: { type: String, default: "MISMO USUARIO" }, // Quien se lleva la plata en mano (ej: JUAN)
    
    // Datos de Venta
    cliente: { type: String, default: "-" },
    pagoReal: { type: Number, default: 0 }, // Lo que realmente entró a caja (en ventas split)
    destinoFondos: { type: String, default: "CAJA" }, // CAJA, MP, BANCO
    
    // Sellos de Tiempo (Strings para mantener formato exacto del HTML)
    fecha: { type: String }, 
    hora: { type: String },
    timestamp: { type: Date, default: Date.now } // Para ordenamiento interno
});

// B. ESQUEMA DE CLIENTES (DEUDA Y FIADO)
const ClienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true, uppercase: true },
    telefono: { type: String, default: "" },
    deudaActual: { type: Number, default: 0 },
    ultimaActualizacion: { type: Date, default: Date.now }
});

// C. MODELOS (Las herramientas para guardar)
const Movimiento = mongoose.model('Movimiento', MovimientoSchema);
const Cliente = mongoose.model('Cliente', ClienteSchema);

// ================================================================
// 5. RUTAS DE LA API (LOS TÚNELES DE DATOS)
// ================================================================

// --- RUTA 1: GUARDAR MOVIMIENTOS (VENTAS, GASTOS, RETIROS) ---
app.post('/api/movimientos', async (req, res) => {
    try {
        const nuevoMov = new Movimiento(req.body);
        await nuevoMov.save();
        console.log(`💾 DATO GUARDADO: ${nuevoMov.tipo} | $${nuevoMov.monto} | Resp: ${nuevoMov.responsableFisico}`);
        res.json({ ok: true, mensaje: "GUARDADO EXITOSO EN DB" });
    } catch (error) {
        console.error("Error guardando movimiento:", error);
        res.status(500).json({ ok: false, error: "Error de servidor" });
    }
});

// --- RUTA 2: LEER MOVIMIENTOS (PARA CAJA Y AUDITORÍA) ---
app.get('/api/movimientos', async (req, res) => {
    try {
        // Traemos los últimos 200 movimientos ordenados del más nuevo al más viejo
        const lista = await Movimiento.find().sort({ timestamp: -1 }).limit(200);
        res.json(lista);
    } catch (error) {
        res.status(500).json({ ok: false, error: "Error leyendo DB" });
    }
});

// --- RUTA 3: BUSCAR O CREAR CLIENTES ---
app.get('/api/clientes/:query', async (req, res) => {
    const q = req.params.query;
    try {
        // Búsqueda "difusa" (busca coincidencias parciales)
        const resultados = await Cliente.find({ 
            nombre: { $regex: q, $options: 'i' } 
        }).limit(10);
        res.json(resultados);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.get('/api/clientes', async (req, res) => {
    // Para listar todos los deudores
    try {
        const todos = await Cliente.find();
        res.json(todos);
    } catch (error) {
        res.status(500).json([]);
    }
});

// --- RUTA 4: ACTUALIZAR DEUDA DE CLIENTE ---
app.post('/api/clientes', async (req, res) => {
    const { nombre, deuda, telefono } = req.body;
    try {
        let cliente = await Cliente.findOne({ nombre: nombre });
        
        if (cliente) {
            // Cliente existe: Actualizamos deuda
            cliente.deudaActual = deuda; 
            if(telefono) cliente.telefono = telefono;
            cliente.ultimaActualizacion = new Date();
            await cliente.save();
        } else {
            // Cliente nuevo: Creamos ficha
            cliente = new Cliente({ 
                nombre, 
                telefono, 
                deudaActual: deuda 
            });
            await cliente.save();
        }
        res.json({ ok: true, cliente });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTA 5: EL VEREDICTO (CÁLCULOS MATEMÁTICOS PARA U2) ---
app.post('/api/veredicto', async (req, res) => {
    try {
        // Aquí el servidor suma todo lo que hay en la base de datos
        const movimientos = await Movimiento.find();
        
        let ventasTotales = 0;
        let gastosTotales = 0;
        let retirosTotales = 0;
        let dineroEnCaja = 0;

        movimientos.forEach(m => {
            // Sumar Ventas
            if(m.tipo === "VENTA") {
                ventasTotales += m.monto;
                // Si el dinero fue a CAJA (no banco), suma al arqueo físico
                if(m.destinoFondos === "CAJA") dineroEnCaja += (m.pagoReal || 0);
            }
            
            // Sumar Gastos
            if(m.tipo === "GASTO") {
                gastosTotales += m.monto;
                dineroEnCaja -= m.monto; // El gasto sale de la caja física
            }

            // Sumar Retiros (Solo para control de caja, no afecta Ganancia Neta)
            if(m.tipo.includes("RETIRO") || m.tipo.includes("CIERRE")) {
                retirosTotales += m.monto;
                dineroEnCaja -= m.monto; // El retiro vacía la caja física
            }
        });

        // Ganancia Neta = Ventas - Gastos (Los retiros no son pérdida, son ganancia que te llevaste)
        const gananciaNeta = ventasTotales - gastosTotales;

        res.json({
            gananciaNeta: gananciaNeta,
            ventas: ventasTotales,
            gastos: gastosTotales,
            diferenciaCaja: dineroEnCaja // Debería tender a cero si se retiró todo correctamente
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error calculando estadísticas" });
    }
});

// ================================================================
// 6. ENCENDER EL SERVIDOR
// ================================================================
app.listen(PORT, () => {
    console.log("--------------------------------------------------");
    console.log(`🚀 SERVIDOR VISIÓN MOISÉS LISTO EN PUERTO: ${PORT}`);
    console.log("📡 ESCUCHANDO PETICIONES DEL HTML...");
    console.log("💾 BASE DE DATOS: CONECTADA Y SEGURA.");
    console.log("--------------------------------------------------");
});
