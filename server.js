const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Configuración de Base de Datos
const db = new sqlite3.Database('./msn_database.db');

// Crear tablas si no existen (Mantenemos todo lo anterior)
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (user TEXT PRIMARY KEY, pass TEXT, foto TEXT, descripcion TEXT, online INTEGER)");
    db.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, to_user TEXT, text TEXT, isBuzz INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
});

app.use(express.static(__dirname));

// Almacén de sockets para saber quién es quién
let activeSockets = {};

io.on('connection', (socket) => {
    let currentUser = "";

    // 1. LOGIN Y PERFIL
    socket.on('login', (data) => {
        db.get("SELECT * FROM users WHERE user = ?", [data.user], (err, row) => {
            if (row) {
                if (row.pass === data.pass) {
                    currentUser = data.user;
                    activeSockets[currentUser] = socket.id;
                    db.run("UPDATE users SET online = 1 WHERE user = ?", [currentUser]);
                    finalizarLogin(socket, row);
                } else {
                    socket.emit('login_status', { success: false, msg: "Pass incorrecta" });
                }
            } else {
                // Registro automático si no existe
                db.run("INSERT INTO users (user, pass, online) VALUES (?, ?, 1)", [data.user, data.pass], function(err) {
                    currentUser = data.user;
                    activeSockets[currentUser] = socket.id;
                    finalizarLogin(socket, { user: currentUser, foto: null, descripcion: "Disponible" });
                });
            }
        });
    });

    function finalizarLogin(s, perfil) {
        s.emit('login_status', { success: true, user: currentUser, perfil: perfil });
        enviarListaContactos();
    }

    // 2. ACTUALIZAR PERFIL (Base64)
    socket.on('update_profile', (data) => {
        if (!currentUser) return;
        if (data.foto) {
            db.run("UPDATE users SET descripcion = ?, foto = ? WHERE user = ?", [data.desc, data.foto, currentUser]);
        } else {
            db.run("UPDATE users SET descripcion = ? WHERE user = ?", [data.desc, currentUser]);
        }
        enviarListaContactos();
    });

    // 3. LÓGICA DE MENSAJES (SALA O PRIVADO)
    socket.on('chat message', (m) => {
        if (!currentUser) return;
        const msgData = {
            user: currentUser,
            to: m.to || 'conversando',
            text: m.text || "",
            isBuzz: m.isBuzz || false
        };

        // Guardar en DB
        db.run("INSERT INTO messages (user, to_user, text, isBuzz) VALUES (?, ?, ?, ?)", 
               [msgData.user, msgData.to, msgData.text, msgData.isBuzz ? 1 : 0]);

        // Enviar a todos (El cliente filtrará si es global o para él)
        io.emit('chat message', msgData);
    });

    // 4. HISTORIAL INTELIGENTE
    socket.on('get_private_history', (target) => {
        if (!currentUser) return;
        let query = "";
        let params = [];

        if (['conversando', 'juegos', 'solotodo'].includes(target)) {
            query = "SELECT * FROM messages WHERE to_user = ? ORDER BY id DESC LIMIT 50";
            params = [target];
        } else {
            query = "SELECT * FROM messages WHERE (user = ? AND to_user = ?) OR (user = ? AND to_user = ?) ORDER BY id DESC LIMIT 50";
            params = [currentUser, target, target, currentUser];
        }

        db.all(query, params, (err, rows) => {
            socket.emit('actualizar_historial', { target: target, history: rows ? rows.reverse() : [] });
        });
    });

    // --- AQUÍ ESTÁ LA LÍNEA QUE BUSCABAS: LÓGICA DE "ESCRIBIENDO..." ---
    socket.on('typing', (data) => {
        // Retransmitimos a todos, los clientes filtrarán si el mensaje es para ellos
        socket.broadcast.emit('typing_status', data);
    });
    // ---------------------------------------------------------------

    // 5. DESCONEXIÓN
    socket.on('disconnect', () => {
        if (currentUser) {
            db.run("UPDATE users SET online = 0 WHERE user = ?", [currentUser]);
            delete activeSockets[currentUser];
            enviarListaContactos();
        }
    });

    function enviarListaContactos() {
        db.all("SELECT user, foto, descripcion, online FROM users", [], (err, rows) => {
            io.emit('lista_contactos', rows);
        });
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`MSN Server corriendo en puerto ${PORT}`);
});