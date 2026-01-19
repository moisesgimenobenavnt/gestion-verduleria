// ================================================================
// █ SERVIDOR MAESTRO: "VISIÓN MOISÉS V5"
// █ TIPO: BACKEND DE ALTA SEGURIDAD (CLOUD READY)
// █ BASE DE DATOS: MONGODB ATLAS (NUBE)
// ================================================================

// 1. CARGA DE MÓDULOS DE SISTEMA
// ----------------------------------------------------------------
const express = require('express');      // El motor del servidor
const mongoose = require('mongoose');    // El traductor para la Base de Datos
const cors = require('cors');            // Permisos de seguridad para el HTML
const bodyParser = require('body-parser'); // Para leer datos complejos

// 2. CONFIGURACIÓN DEL PUERTO (VITAL PARA LA NUBE)
// ----------------------------------------------------------------
const app = express();
// NOTA TÉCNICA: "process.env.PORT" es el puerto que nos asigna la Nube automáticamente.
// Si estamos en casa (Local), usará el 3001 para no chocar con otros programas.
const PORT = process.env.PORT || 3001; 

// 3. MIDDLEWARE DE SEGURIDAD
// ----------------------------------------------------------------
app.use(cors()); // Abre el canal de comunicación seguro
app.use(bodyParser.json()); // Permite recibir JSON (datos estructurados)

// ================================================================
// 4. CONEXIÓN A LA BASE DE DATOS (EL HONGO EN LA NUBE)
// ================================================================

// TU LLAVE MAESTRA DE ACCESO (NO COMPARTIR)
const uri = "mongodb+srv://moises-verduleria:MOISESsandra2042@mibazarimpecable.qhhyri1.mongodb.net/verduleria_db?retryWrites=true&w=majority&appName=MIBAZARIMPECABLE";

console.log(" ");
console.log("📡 INICIANDO PROTOCOLO DE CONEXIÓN...");
console.log("📡 BUSCANDO SERVIDOR EN MONGODB ATLAS...");

mongoose.connect(uri, {
    // Configuraciones para mantener la conexión estable en internet
    serverSelectionTimeoutMS: 5000, 
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log("--------------------------------------------------");
    console.log("✅ ¡CONEXIÓN EXITOSA A LA NUBE!");
    console.log("💾 BASE DE DATOS: 'mibazarimpecable' (ONLINE)");
    console.log("🔒 ESTADO: ENCRIPTADO Y SEGURO");
    console.log("--------------------------------------------------");
})
.catch(err => {
    console.error("❌ ERROR CRÍTICO DE CONEXIÓN:");
    console.error("   El servidor no pudo alcanzar la nube.");
    console.error("   Detalle técnico:", err);
});

// ================================================================
// 5. ESQUEMAS DE DATOS (LAS CAJAS FUERTES)
// ================================================================

// A. ESQUEMA DE MOVIMIENTOS (HUELLA FORENSE COMPLETA)
// Guarda cada detalle de lo que pasa en la caja.
const MovimientoSchema = new mongoose.Schema({
    // Tipo de operación: VENTA, GASTO, RETIRO PARCIAL, CIERRE FINAL
    tipo: { type: String, required: true },
    
    // El dinero involucrado
    monto: { type: Number, required: true },
    
    // AUDITORÍA: ¿Quién estaba en la computadora?
    usuarioRegistra: { type: String, required: true },
    
    // AUDITORÍA: ¿Quién se llevó el dinero físico?
    responsableFisico: { type: String, default: "SIN DATOS" },
    
    // Datos opcionales de la venta
    cliente: { type: String, default: "CONSUMIDOR FINAL" },
    pagoReal: { type: Number, default: 0 }, // Lo que entró en efectivo
    destinoFondos: { type: String, default: "CAJA" }, // CAJA, BANCO, MP
    
    // FECHAS Y HORAS (Para reportes legales)
    fecha: { type: String }, 
    hora: { type: String },
    
    // Sello de tiempo exacto para ordenamiento informático
    timestamp: { type: Date, default: Date.now }
});

// B. ESQUEMA DE CLIENTES (CUENTAS CORRIENTES)
// Guarda la deuda y el historial de cada persona.
const ClienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true, uppercase: true },
    telefono: { type: String, default: "" },
    deudaActual: { type: Number, default: 0 }, // EL NÚMERO ROJO
    ultimaActualizacion: { type: Date, default: Date.now },
    
    // Historial detallado de cambios (quién le fio, cuándo pagó)
    historial: [Object] 
});

// CREACIÓN DE LOS MODELOS
const Movimiento = mongoose.model('Movimiento', MovimientoSchema);
const Cliente = mongoose.model('Cliente', ClienteSchema);

// ================================================================
// 6. RUTAS DE LA API (LOS TÚNELES DE INFORMACIÓN)
// ================================================================

// --- RUTA A: GUARDAR MOVIMIENTO (VENTA / GASTO / RETIRO) ---
app.post('/api/movimientos', async (req, res) => {
    try {
        console.log(`📥 RECIBIENDO DATOS: ${req.body.tipo} - $${req.body.monto}`);
        
        const nuevoMov = new Movimiento(req.body);
        await nuevoMov.save(); // <--- AQUÍ SE GRABA EN LA NUBE
        
        console.log(`✅ GUARDADO EN ATLAS: ID ${nuevoMov._id}`);
        res.json({ ok: true, mensaje: "Datos protegidos en la nube" });
    } catch (error) {
        console.error("❌ ERROR AL GUARDAR:", error);
        res.status(500).json({ ok: false, error: "Fallo de escritura en servidor" });
    }
});

// --- RUTA B: LEER HISTORIAL (PARA AUDITORÍA Y CAJA) ---
app.get('/api/movimientos', async (req, res) => {
    try {
        // Trae los últimos 300 movimientos, ordenados del más nuevo al más viejo
        const lista = await Movimiento.find().sort({ timestamp: -1 }).limit(300);
        res.json(lista);
    } catch (error) {
        console.error("Error leyendo historial:", error);
        res.status(500).json({ ok: false });
    }
});

// --- RUTA C: BUSCADOR INTELIGENTE DE CLIENTES ---
app.get('/api/clientes/:query', async (req, res) => {
    const q = req.params.query;
    try {
        // Busca coincidencias parciales (Ej: "GUTI" encuentra a "GUTIERREZ")
        const resultados = await Cliente.find({ 
            nombre: { $regex: q, $options: 'i' } 
        }).limit(10);
        res.json(resultados);
    } catch (error) { 
        res.status(500).json([]); 
    }
});

// --- RUTA D: LISTADO COMPLETO DE DEUDORES ---
app.get('/api/clientes', async (req, res) => {
    try {
        const todos = await Cliente.find();
        res.json(todos);
    } catch (error) { 
        res.status(500).json([]); 
    }
});

// --- RUTA E: GESTIÓN DE DEUDAS (CREAR O ACTUALIZAR) ---
app.post('/api/clientes', async (req, res) => {
    const { nombre, deuda, telefono } = req.body;
    try {
        // 1. Buscamos si ya existe
        let cliente = await Cliente.findOne({ nombre: nombre });
        
        if (cliente) {
            // 2. Si existe, actualizamos
            console.log(`🔄 ACTUALIZANDO CLIENTE: ${nombre}`);
            cliente.deudaActual = deuda; 
            if(telefono) cliente.telefono = telefono;
            cliente.ultimaActualizacion = new Date();
            
            // Agregamos al historial interno
            cliente.historial.push({
                fecha: new Date().toLocaleString(),
                saldo: deuda,
                accion: "ACTUALIZACIÓN AUTOMÁTICA"
            });
            await cliente.save();
        } else {
            // 3. Si no existe, lo creamos
            console.log(`✨ NUEVO CLIENTE: ${nombre}`);
            cliente = new Cliente({ 
                nombre, 
                telefono, 
                deudaActual: deuda,
                historial: [{
                    fecha: new Date().toLocaleString(),
                    saldo: deuda,
                    accion: "ALTA EN SISTEMA"
                }]
            });
            await cliente.save();
        }
        res.json({ ok: true, cliente });
    } catch (error) { 
        console.error("Error cliente:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// --- RUTA F: EL VEREDICTO (CÁLCULO MATEMÁTICO BLINDADO) ---
app.post('/api/veredicto', async (req, res) => {
    try {
        // 1. Traer todos los movimientos de la historia
        const movimientos = await Movimiento.find();
        
        // 2. Variables para el cálculo
        let ventasTotales = 0;
        let gastosTotales = 0;
        let cajaFisicaTeorica = 0;

        // 3. Procesar uno por uno
        movimientos.forEach(m => {
            // VENTAS
            if(m.tipo === "VENTA") {
                ventasTotales += m.monto;
                // Solo suma a caja física si no fue banco o mercado pago
                if(m.destinoFondos === "CAJA") {
                    cajaFisicaTeorica += (m.pagoReal || 0);
                }
            }
            // GASTOS (Restan ganancia y restan caja física)
            if(m.tipo === "GASTO") {
                gastosTotales += m.monto;
                cajaFisicaTeorica -= m.monto;
            }
            // RETIROS (Solo restan caja física, no es pérdida)
            if(m.tipo.includes("RETIRO") || m.tipo.includes("CIERRE")) {
                cajaFisicaTeorica -= m.monto;
            }
        });
        
        // 4. Resultado final
        const gananciaNeta = ventasTotales - gastosTotales;

        res.json({ 
            gananciaNeta: gananciaNeta, 
            ventas: ventasTotales, 
            gastos: gastosTotales, 
            diferenciaCaja: cajaFisicaTeorica 
        });

    } catch (error) { 
        console.error("Error veredicto:", error);
        res.status(500).json({ error: "Error de cálculo matemático" }); 
    }
});

// ================================================================
// 7. ENCENDIDO FINAL
// ================================================================
app.listen(PORT, () => {
    console.log(" ");
    console.log("██████████████████████████████████████████████████");
    console.log("█  SISTEMA VISIÓN MOISÉS V5 - ONLINE             █");
    console.log(`█  PUERTO ACTIVO: ${PORT}                           █`);
    console.log("█  MODO: PRODUCCIÓN / NUBE                       █");
    console.log("██████████████████████████████████████████████████");
    console.log(" ");
});
