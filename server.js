// =============================================================================
// █ NOMBRE DEL SISTEMA: VISIÓN MOISÉS V5
// █ TIPO DE ARCHIVO: SERVER.JS (CEREBRO DEL SISTEMA)
// █ ENTORNO: NUBE (MONGODB ATLAS) + DEPLOY
// =============================================================================

// -----------------------------------------------------------------------------
// 1. IMPORTACIÓN DE LIBRERÍAS (LOS CIMIENTOS)
// -----------------------------------------------------------------------------
const express = require('express');       // El motor del servidor web
const mongoose = require('mongoose');     // La herramienta para hablar con la Base de Datos
const cors = require('cors');             // Permisos de seguridad para el navegador
const bodyParser = require('body-parser'); // Para leer los datos que envía el HTML
const path = require('path');             // IMPORTANTE: Para encontrar el archivo index.html en la nube

// -----------------------------------------------------------------------------
// 2. CONFIGURACIÓN DEL SERVIDOR Y PUERTO
// -----------------------------------------------------------------------------
const app = express();

// IMPORTANTE: La nube (Render/Glitch) nos asigna un puerto aleatorio en 'process.env.PORT'.
// Si no nos da uno (estamos en casa), usamos el 3001.
const PORT = process.env.PORT || 3001; 

// -----------------------------------------------------------------------------
// 3. MIDDLEWARE (CAPAS DE SEGURIDAD Y TRADUCCIÓN)
// -----------------------------------------------------------------------------
app.use(cors()); // Permitir el paso de datos
app.use(bodyParser.json()); // Entender formato JSON

// --- CONFIGURACIÓN CRÍTICA PARA QUE LA PÁGINA SE VEA ---
// Esto le dice al servidor: "La carpeta actual contiene los archivos de la web".
app.use(express.static(__dirname));

// Cuando alguien entre a la página principal ('/'), envíale el archivo index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// -----------------------------------------------------------------------------
// 4. CONEXIÓN A LA BASE DE DATOS (EL HONGO EN LA NUBE)
// -----------------------------------------------------------------------------
// Esta es tu dirección secreta de MongoDB Atlas.
const uri = "mongodb+srv://moises-verduleria:MOISESsandra2042@mibazarimpecable.qhhyri1.mongodb.net/verduleria_db?retryWrites=true&w=majority&appName=MIBAZARIMPECABLE";

console.log(" ");
console.log("📡 INICIANDO SISTEMA VISIÓN MOISÉS...");
console.log("📡 INTENTANDO CONECTAR A LA NUBE (ATLAS)...");

mongoose.connect(uri, {
    // Estas opciones mantienen la conexión estable si el internet parpadea
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log("--------------------------------------------------");
    console.log("✅ ¡CONEXIÓN EXITOSA A LA NUBE!");
    console.log("💾 BASE DE DATOS: 'mibazarimpecable' ONLINE");
    console.log("🔒 ESTADO: ENCRIPTADO Y GUARDANDO DATOS");
    console.log("--------------------------------------------------");
})
.catch(err => {
    console.error("❌ ERROR CRÍTICO DE CONEXIÓN:");
    console.error("   El servidor no pudo alcanzar la nube de MongoDB.");
    console.error("   Detalle técnico:", err);
});

// -----------------------------------------------------------------------------
// 5. ESQUEMAS DE SEGURIDAD (LAS CAJAS FUERTES DE DATOS)
// -----------------------------------------------------------------------------

// A. ESQUEMA DE MOVIMIENTOS (HUELLA FORENSE)
// Guarda absolutamente todo lo que pasa por la caja.
const MovimientoSchema = new mongoose.Schema({
    // Tipo: VENTA, GASTO, RETIRO PARCIAL, CIERRE FINAL
    tipo: { type: String, required: true },
    
    // Monto: El dinero involucrado
    monto: { type: Number, required: true },
    
    // HUELLA FORENSE: Quién estaba logueado
    usuarioRegistra: { type: String, required: true },
    
    // HUELLA FORENSE: Quién manipuló el dinero físico
    responsableFisico: { type: String, default: "-" },
    
    // Datos opcionales de ventas
    cliente: { type: String, default: "-" },
    pagoReal: { type: Number, default: 0 },
    destinoFondos: { type: String, default: "CAJA" }, // CAJA, BANCO, ETC
    
    // Fecha y Hora (Strings para mantener formato visual)
    fecha: { type: String }, 
    hora: { type: String },
    
    // Fecha real para ordenamiento en base de datos
    timestamp: { type: Date, default: Date.now }
});

// B. ESQUEMA DE CLIENTES (CUENTAS CORRIENTES)
// Gestiona las deudas y los fiados.
const ClienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true, uppercase: true },
    telefono: { type: String, default: "" },
    deudaActual: { type: Number, default: 0 }, // SALDO EN ROJO
    ultimaActualizacion: { type: Date, default: Date.now },
    historial: [Object] // Lista de cambios de deuda
});

// CREACIÓN DE LOS MODELOS
const Movimiento = mongoose.model('Movimiento', MovimientoSchema);
const Cliente = mongoose.model('Cliente', ClienteSchema);

// -----------------------------------------------------------------------------
// 6. RUTAS DE LA API (LOS CABLES QUE CONECTAN CON EL HTML)
// -----------------------------------------------------------------------------

// --- RUTA 1: GUARDAR MOVIMIENTO ---
app.post('/api/movimientos', async (req, res) => {
    try {
        console.log(`📥 RECIBIENDO: ${req.body.tipo} de $${req.body.monto}`);
        
        const nuevoMov = new Movimiento(req.body);
        await nuevoMov.save(); // GUARDADO FÍSICO EN NUBE
        
        console.log(`☁️ SUBIDO A ATLAS EXITOSAMENTE.`);
        res.json({ ok: true });
    } catch (error) {
        console.error("❌ Error al subir a la nube:", error);
        res.status(500).json({ ok: false, error: "Error de servidor" });
    }
});

// --- RUTA 2: LEER HISTORIAL (PARA AUDITORÍA Y CAJA) ---
app.get('/api/movimientos', async (req, res) => {
    try {
        // Traer últimos 300 movimientos, ordenados por fecha descendente
        const lista = await Movimiento.find().sort({ timestamp: -1 }).limit(300);
        res.json(lista);
    } catch (error) {
        res.status(500).json({ ok: false });
    }
});

// --- RUTA 3: BUSCAR CLIENTES (AUTOCOMPLETADO) ---
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

// --- RUTA 4: CREAR O ACTUALIZAR CLIENTE (DEUDA) ---
app.post('/api/clientes', async (req, res) => {
    const { nombre, deuda, telefono } = req.body;
    try {
        let cliente = await Cliente.findOne({ nombre: nombre });
        
        if (cliente) {
            // Si existe, actualizamos
            cliente.deudaActual = deuda; 
            if(telefono) cliente.telefono = telefono;
            cliente.ultimaActualizacion = new Date();
            await cliente.save();
        } else {
            // Si no, creamos
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

// --- RUTA 5: LISTAR TODOS LOS DEUDORES ---
app.get('/api/clientes', async (req, res) => {
    try {
        const todos = await Cliente.find();
        res.json(todos);
    } catch (error) { 
        res.status(500).json([]); 
    }
});

// --- RUTA 6: EL VEREDICTO (CÁLCULO MATEMÁTICO EN SERVIDOR) ---
app.post('/api/veredicto', async (req, res) => {
    try {
        const movimientos = await Movimiento.find();
        
        let ventas = 0;
        let gastos = 0;
        let retiros = 0;
        let cajaFisica = 0;

        movimientos.forEach(m => {
            // SUMAR VENTAS
            if(m.tipo === "VENTA") {
                ventas += m.monto;
                if(m.destinoFondos === "CAJA") cajaFisica += (m.pagoReal || 0);
            }
            // RESTAR GASTOS
            if(m.tipo === "GASTO") {
                gastos += m.monto;
                cajaFisica -= m.monto;
            }
            // RESTAR RETIROS (Solo de caja física)
            if(m.tipo.includes("RETIRO") || m.tipo.includes("CIERRE")) {
                retiros += m.monto;
                cajaFisica -= m.monto;
            }
        });
        
        // CÁLCULO GANANCIA NETA
        const gananciaNeta = ventas - gastos;

        res.json({ 
            gananciaNeta: gananciaNeta, 
            ventas: ventas, 
            gastos: gastos, 
            diferenciaCaja: cajaFisica 
        });

    } catch (error) { 
        res.status(500).json({ error: "Error calculando estadísticas" }); 
    }
});

// -----------------------------------------------------------------------------
// 7. ENCENDIDO DEL MOTOR
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(" ");
    console.log("██████████████████████████████████████████████████");
    console.log("█  SISTEMA VISIÓN MOISÉS V5 - ONLINE             █");
    console.log(`█  PUERTO ACTIVO: ${PORT}                           █`);
    console.log("█  MODO: PRODUCCIÓN / NUBE                       █");
    console.log("██████████████████████████████████████████████████");
    console.log(" ");
});
