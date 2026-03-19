const express = require('express');
const app = express();
const http = require('http').Server(app);
const path = require('path');
const io = require('socket.io')(http, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db;
(async () => {
    db = await open({ filename: path.join(__dirname, 'database.sqlite'), driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (user TEXT PRIMARY KEY, pass TEXT, foto TEXT DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png', descripcion TEXT DEFAULT '¿En qué piensas?');
        CREATE TABLE IF NOT EXISTS mensajes (id INTEGER PRIMARY KEY AUTOINCREMENT, de TEXT, para TEXT, texto TEXT, tipo TEXT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP);
    `);
})();

let online = {};

io.on('connection', (socket) => {
    socket.on('login', async (data) => {
        let userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [data.user]);
        if (!userDB) {
            await db.run('INSERT INTO usuarios (user, pass) VALUES (?, ?)', [data.user, data.pass]);
            userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [data.user]);
        } else if (userDB.pass !== data.pass) return socket.emit('login_status', { success: false });

        socket.userName = data.user;
        online[data.user] = socket.id;
        
        const history = await db.all('SELECT de as user, texto as text, tipo FROM mensajes WHERE para IS NULL ORDER BY id ASC LIMIT 50');
        socket.emit('login_status', { success: true, user: data.user, perfil: userDB, history });
        updateList();
    });

    async function updateList() {
        const todos = await db.all('SELECT user, foto, descripcion FROM usuarios');
        const lista = todos.map(u => ({ ...u, online: !!online[u.user] }));
        io.emit('lista_contactos', lista);
    }

    socket.on('chat message', async (m) => {
        const tipo = m.isBuzz ? 'zumbido' : 'texto';
        // Si 'to' es null, juegos o solotodo, es grupal/sala
        const esSala = !m.to || m.to === 'juegos' || m.to === 'solotodo';
        await db.run('INSERT INTO mensajes (de, para, texto, tipo) VALUES (?,?,?,?)', [socket.userName, esSala ? m.to : m.to, m.text, tipo]);
        
        if (esSala) {
            io.emit('chat message', { ...m, user: socket.userName });
        } else {
            if (online[m.to]) io.to(online[m.to]).emit('chat message', { ...m, user: socket.userName });
            socket.emit('chat message', { ...m, user: socket.userName });
        }
    });

    socket.on('get_private_history', async (target) => {
        const h = await db.all('SELECT de as user, texto as text, tipo FROM mensajes WHERE (de=? AND para=?) OR (de=? AND para=?) ORDER BY id ASC', [socket.userName, target, target, socket.userName]);
        socket.emit('actualizar_historial', h);
    });

    socket.on('disconnect', () => { delete online[socket.userName]; updateList(); });
});

http.listen(process.env.PORT || 3000, () => console.log("MSN Live!"));