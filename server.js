const express = require('express');
const app = express();
const http = require('http').Server(app);
const path = require('path');
const io = require('socket.io')(http, { 
    cors: { origin: "*" }, 
    maxHttpBufferSize: 1e8 
});
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db;

// Inicialización con manejo de errores para Render
(async () => {
    try {
        db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS usuarios (
                user TEXT PRIMARY KEY, pass TEXT, foto TEXT DEFAULT 'https://i.imgur.com/89n7DNP.png', 
                descripcion TEXT DEFAULT 'Sintiendo la nostalgia...', estado TEXT DEFAULT 'Disponible'
            );
            CREATE TABLE IF NOT EXISTS mensajes_grupal (
                id INTEGER PRIMARY KEY AUTOINCREMENT, sala TEXT, usuario TEXT, texto TEXT, archivo TEXT, tipo TEXT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS mensajes_privado (
                id INTEGER PRIMARY KEY AUTOINCREMENT, de TEXT, para TEXT, texto TEXT, archivo TEXT, tipo TEXT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Base de datos SQLite lista y conectada.");
    } catch (err) {
        console.error("❌ Error al iniciar la base de datos:", err);
    }
})();

app.use(express.static(__dirname));

let socketIds = {}; 

async function enviarListaContactos() {
    try {
        const todos = await db.all('SELECT user, foto, descripcion, estado FROM usuarios');
        const listaFinal = todos.map(u => ({
            ...u,
            online: !!socketIds[u.user]
        }));
        io.emit('lista_contactos', listaFinal);
    } catch (e) { console.log("Error lista:", e); }
}

io.on('connection', (socket) => {
    socket.on('login', async (data) => {
        const { user, pass } = data;
        if(!user || !pass) return;

        let userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [user]);

        if (!userDB) {
            await db.run('INSERT INTO usuarios (user, pass) VALUES (?, ?)', [user, pass]);
            userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [user]);
        } else if (userDB.pass !== pass) {
            return socket.emit('login_status', { success: false, msg: "Clave incorrecta." });
        }

        socket.userName = user;
        socketIds[user] = socket.id;
        
        const history = await db.all('SELECT usuario as user, texto as text, archivo as img, tipo FROM mensajes_grupal WHERE sala = "Conversando" ORDER BY id DESC LIMIT 30');
        
        socket.join("Conversando");
        socket.currentRoom = "Conversando";
        socket.emit('login_status', { success: true, user, perfil: userDB, history: history.reverse() });
        enviarListaContactos();
    });

    socket.on('update_profile', async (data) => {
        if(!socket.userName) return;
        await db.run('UPDATE usuarios SET foto = ?, descripcion = ? WHERE user = ?', [data.foto, data.desc, socket.userName]);
        enviarListaContactos();
    });

    socket.on('chat message', async (data) => {
        if(!socket.userName) return;
        let tipo = data.isBuzz ? 'zumbido' : (data.img ? 'imagen' : 'texto');
        const user = socket.userName;

        if (data.to) {
            await db.run('INSERT INTO mensajes_privado (de, para, texto, archivo, tipo) VALUES (?,?,?,?,?)', [user, data.to, data.text || null, data.img || null, tipo]);
            if (socketIds[data.to]) io.to(socketIds[data.to]).emit('chat message', {...data, user});
            socket.emit('chat message', {...data, user});
        } else {
            const room = socket.currentRoom || "Conversando";
            await db.run('INSERT INTO mensajes_grupal (sala, usuario, texto, archivo, tipo) VALUES (?,?,?,?,?)', [room, user, data.text || null, data.img || null, tipo]);
            io.to(room).emit('chat message', {...data, user});
        }
    });

    socket.on('get_private_history', async (target) => {
        const h = await db.all('SELECT de as user, texto as text, archivo as img, tipo FROM mensajes_privado WHERE (de = ? AND para = ?) OR (de = ? AND para = ?) ORDER BY id DESC LIMIT 50', [socket.userName, target, target, socket.userName]);
        socket.emit('actualizar_historial', h.reverse());
    });

    socket.on('disconnect', () => {
        if (socket.userName) {
            delete socketIds[socket.userName];
            enviarListaContactos();
        }
    });
});

// PUERTO DINÁMICO PARA RENDER
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log(`🚀 MSN THE REALS en puerto ${PORT}`));