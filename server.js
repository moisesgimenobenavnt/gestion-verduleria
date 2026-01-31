// =============================================================================
// █ NOMBRE DEL SISTEMA: VISIÓN MOISÉS V5
// █ ARCHIVO: SERVER.JS (CEREBRO DEL SISTEMA - VERSIÓN ROBUSTA)
// █ ESTADO: CORREGIDO Y VERIFICADO
// =============================================================================

// 1. IMPORTACIÓN DE LIBRERÍAS
const express = require('express');       // El motor del servidor
const mongoose = require('mongoose');     // Conexión a Base de Datos (Atlas)
const cors = require('cors');             // Permisos de seguridad
const path = require('path');             // Manejo de rutas de carpetas

// 2. CONFIGURACIÓN INICIAL
const app = express();
const PORT = process.env.PORT || 3001;

// 3. MIDDLEWARE (CAPAS DE SEGURIDAD)
app.use(cors());
app.use(express.json()); // Configuración moderna para leer JSON
app.use(express.static(__dirname)); // Servir los archivos de la carpeta actual

// RUTA PRINCIPAL (Carga la pantalla visual)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// -----------------------------------------------------------------------------
// 4. CONEXIÓN A LA NUBE (MONGODB ATLAS)
// ----------------------------------------------------------
const uri = "mongodb+srv://moises-verduleria:MOISESsandra2042@mibazarimpecable.qhhyri1.mongodb.net/verduleria_db?retryWrites=true&w=majority&appName=MIBAZARIMPECABLE";

console.log("📡 INICIANDO PROTOCOLO DE CONEXIÓN...");

mongoose.connect(uri)
.then(() => {
    console.log("==========================================");
    console.log("✅ CONEXIÓN EXITOSA A LA NUBE (ATLAS)");
    console.log("💾 BASE DE DATOS 'mibazarimpecable' ONLINE");
    console.log("==========================================");
})
.catch(err => {
    console.error("❌ ERROR CRÍTICO DE CONEXIÓN:", err.message);
});

// -----------------------------------------------------------------------------
// 5. ESQUEMAS DE SEGURIDAD (MODELOS DE DATOS)
// -----------------------------------------------------------------------------

// A. ESQUEMA DE MOVIMIENTOS (Caja, Ventas y Auditoría)
const MovimientoSchema = new mongoose.Schema({
    tipo: { type: String, required: true }, // VENTA, GASTO, RETIRO...
    monto: { type: Number, required: true },
    
    // HUELLA FORENSE
    usuarioRegistra: { type: String, required: true }, 
    responsableFisico: { type: String, default: "-" },
    
    // DATOS DE OPERACIÓN
    cliente: { type: String, default: "-" },
    pagoReal: { type: Number, default: 0 }, // Lo que entra en efectivo/banco
    destinoFondos: { type: String, default: "CAJA" }, // CAJA, MP, BCO
    
    // FECHAS (Texto para visualización y Date para ordenamiento)
    fecha: { type: String }, 
    hora: { type: String },
    timestamp: { type: Date, default: Date.now } 
});

// B. ESQUEMA DE CLIENTES (Cuentas Corrientes)
const ClienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true, unique: true, uppercase: true },
    telefono: { type: String, default: "" },
    deudaActual: { type: Number, default: 0 }, // Saldo en Rojo
    ultimaActualizacion: { type: Date, default: Date.now }
});

// CREACIÓN DE MODELOS
const Movimiento = mongoose.model('Movimiento', MovimientoSchema);
const Cliente = mongoose.model('Cliente', ClienteSchema);

// -----------------------------------------------------------------------------
// 6. RUTAS DE LA API (ENDPOINTS)
// -----------------------------------------------------------------------------

// --- RUTA: GUARDAR MOVIMIENTO (Venta, Gasto, Retiro) ---
app.post('/api/movimientos', async (req, res) => {
    try {
        const nuevoMov = new Movimiento(req.body);
        await nuevoMov.save();
        console.log(`📝 REGISTRO GUARDADO: ${req.body.tipo} - $${req.body.monto}`);
        res.json({ ok: true });
    } catch (error) {
        console.error("Error al guardar:", error);
        res.status(500).json({ ok: false, error: "Error de servidor" });
    }
});

// --- RUTA: LEER HISTORIAL (Últimos 300 para agilidad) ---
app.get('/api/movimientos', async (req, res) => {
    try {
        const lista = await Movimiento.find().sort({ timestamp: -1 }).limit(300);
        res.json(lista);
    } catch (error) {
        res.status(500).json({ ok: false });
    }
});

// --- RUTA: BUSCADOR PREDICTIVO DE CLIENTES ---
app.get('/api/clientes/:query', async (req, res) => {
    try {
        const resultados = await Cliente.find({ 
            nombre: { $regex: req.params.query, $options: 'i' } 
        }).limit(10);
        res.json(resultados);
    } catch (error) { res.status(500).json([]); }
});

// --- RUTA: CREAR O ACTUALIZAR DEUDA CLIENTE ---
app.post('/api/clientes', async (req, res) => {
    const { nombre, deuda, telefono } = req.body;
    try {
        let cliente = await Cliente.findOne({ nombre: nombre });
        
        if (cliente) {
            // Si existe, actualizamos saldo
            cliente.deudaActual = deuda; 
            if(telefono) cliente.telefono = telefono;
            cliente.ultimaActualizacion = new Date();
            await cliente.save();
        } else {
            // Si no existe, creamos ficha nueva
            cliente = new Cliente({ 
                nombre, 
                telefono, 
                deudaActual: deuda 
            });
            await cliente.save();
        }
        res.json({ ok: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- RUTA: LISTAR TODOS LOS DEUDORES ---
app.get('/api/clientes', async (req, res) => {
    try {
        const todos = await Cliente.find();
        res.json(todos);
    } catch (error) { res.status(500).json([]); }
});

// --- RUTA: EL VEREDICTO (ESTADÍSTICAS POR FECHA) ---
// CORREGIDO: Ahora soporta rango de fechas enviado desde el HTML
app.post('/api/veredicto', async (req, res) => {
    try {
        // Obtenemos fechas del cuerpo de la petición (si existen)
        // El frontend puede enviar { fechaDesde: 'YYYY-MM-DD', fechaHasta: 'YYYY-MM-DD' }
        const { fechaDesde, fechaHasta } = req.body;
        
        // Configurar filtro de búsqueda
        let filtro = {};
        
        if (fechaDesde && fechaHasta) {
            // Ajustamos las horas para cubrir todo el día
            const desde = new Date(fechaDesde); desde.setHours(0,0,0,0);
            const hasta = new Date(fechaHasta); hasta.setHours(23,59,59,999);
            
            filtro.timestamp = { $gte: desde, $lte: hasta };
        }

        // Buscamos movimientos que coincidan con el filtro
        const movimientos = await Movimiento.find(filtro);
        
        let ventasTotales = 0;
        let gastosTotales = 0;
        let retirosCaja = 0;
        let cajaFisicaTeorica = 0;

        movimientos.forEach(m => {
            // 1. CÁLCULO DE VENTAS
            if(m.tipo === "VENTA") {
                ventasTotales += m.monto; // Valor de la mercadería vendida
                
                // Solo suma a la caja física si el destino fue CAJA (No MercadoPago)
                if(m.destinoFondos === "CAJA") {
                    cajaFisicaTeorica += (m.pagoReal || 0);
                }
            }
            
            // 2. CÁLCULO DE GASTOS (Restan de la ganancia y de la caja)
            if(m.tipo === "GASTO") {
                gastosTotales += m.monto;
                cajaFisicaTeorica -= m.monto;
            }
            
            // 3. CÁLCULO DE RETIROS (No restan ganancia, solo sacan billetes de caja)
            if(m.tipo.includes("RETIRO") || m.tipo.includes("CIERRE")) {
                retirosCaja += m.monto;
                cajaFisicaTeorica -= m.monto;
            }
        });
        
        const gananciaNeta = ventasTotales - gastosTotales;

        res.json({ 
            gananciaNeta: gananciaNeta, 
            ventas: ventasTotales, 
            gastos: gastosTotales, 
            diferenciaCaja: cajaFisicaTeorica,
            cantidadMovimientos: movimientos.length
        });

    } catch (error) { 
        console.error("Error en veredicto:", error);
        res.status(500).json({ error: "Error calculando estadísticas" }); 
    }
});

// -----------------------------------------------------------------------------
// 7. ENCENDIDO DEL SERVIDOR
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(" ");
    console.log("██████████████████████████████████████");
    console.log(`✅ SISTEMA ONLINE EN PUERTO: ${PORT}`);
    console.log("██████████████████████████████████████");
});
