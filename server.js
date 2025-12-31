import express from 'express';
import bcrypt from 'bcrypt';
import cloudinary from './public/cloudinary.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import { db, connectToDB } from './public/db.js';

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const saltRounds = 10;


(async () => {
    try {
        await connectToDB();
        await db.query("SELECT 1");

        setInterval(async () => {
            try {
                await db.query('SELECT 1');
                console.log("Pinged DB to keep it warm");
            } catch (err) {
                console.error("Ping failed:", err);
            }
        }, 4 * 60 * 1000);

        app.use(express.static('public'));

        app.get('/api/sign-upload', (req, res) => {
            const timestamp = Math.round((new Date()).getTime() / 1000);
            const folder = req.query.nick;

            const paramsToSign = {
                timestamp,
                folder,
                source: 'uw',
                use_filename: true,
                unique_filename: false,
                overwrite: true,
            };

            const signature = cloudinary.utils.api_sign_request(
                paramsToSign,
                cloudinary.config().api_secret
            );

            res.json({
                signature,
                timestamp,
                folder,
                use_filename: true,
                unique_filename: false,
                overwrite: true,
                apiKey: cloudinary.config().api_key,
                cloudName: cloudinary.config().cloud_name
            });
        });

        app.get('/', (req, res) => {
            res.sendFile(join(__dirname, 'public/index.html'));
        });

        app.get('/all-users', async (req, res) => {
            try {
                const [allUsers] = await db.query(`SELECT name, is_online FROM users ORDER BY is_online DESC, id ASC;`);

                res.json(allUsers);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Something went wrong' });
            }
        });

        app.get('/all-recipes', async (req, res) => {
            try {
                const [allRecipes] = await db.query(`SELECT * FROM recipes ORDER BY time;`);

                res.json(allRecipes);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Something went wrong' });
            }
        });

        app.get('/:nickname/recipes', async (req, res) => {
            try {
                const [userRecipes] = await db.query(`SELECT * FROM recipes WHERE OP = ?`, [req.params.nickname]);

                res.json(userRecipes);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Something went wrong' });
            }
        });

        io.on('connection', (socket) => {
            console.log('a user connected');
            socket.emit('display-all-users');
            socket.emit('display-all-recipes');

            socket.on('user', async (data) => {
                try {
                    const [results] = await db.query(`SELECT * FROM users WHERE name = ?`, [data.nickname]);
                    const nickname = data.nickname;
                    const normalized = nickname.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
                    const isAscii = /^[A-Za-z0-9\s\-]+$/.test(normalized);
                    const byteLength = new TextEncoder().encode(nickname).length;

                    if ((nickname === nickname.trim()) && (normalized && isAscii) && (nickname.length <= 20) && (byteLength <= 80)) {
                        socket.nickname = nickname;

                        if (results.length > 0) {
                            const bool = bcrypt.compareSync(data.password, results[0].password);
                            if (bool) {
                                await db.query(`UPDATE users SET is_online = ? WHERE name = ?`, [true, socket.nickname]);
                                socket.emit('logged-in', socket.nickname);
                                socket.broadcast.emit('display-all-users');
                                io.emit('server-announcement', `+ ${socket.nickname} signed in.`);
                                console.log(`${socket.nickname} signed in!`);
                            } else {
                                socket.emit('incorrect-login');
                            }
                        } else {
                            const hash = bcrypt.hashSync(data.password, saltRounds);

                            await db.query(`INSERT INTO users (name, password) VALUES (?, ?)`, [socket.nickname, hash]);
                            await db.query(`UPDATE users SET is_online = ? WHERE name = ?`, [true, socket.nickname]);

                            socket.emit('logged-in', socket.nickname);
                            socket.broadcast.emit('display-all-users');
                            io.emit('server-announcement', `+ ${socket.nickname} signed up.`);
                            console.log(`${socket.nickname} signed up!`);
                        }
                    }
                } catch (err) {
                    console.log(err);
                    socket.emit('server-announcement', err);
                }
            });

            socket.on('recipe-create', async (data) => {
                try {
                    await db.query(`INSERT INTO recipes (OP, title, instructions, image_urls, time) VALUES (?, ?, ?, ?, ?)`, [data.OP, data.titleInput, data.instructionsInput, JSON.stringify(data.uploadedImgs), new Date().toISOString().slice(0, 19).replace('T', ' ')]);
                    console.log(data.OP + " shared recipe: " + data.titleInput);

                    socket.emit('display-my-recipes');
                    socket.broadcast.emit('display-all-recipes');
                    socket.emit('create-recipe-success');
                    io.emit('server-announcement', `${data.OP} shared recipe: ${data.titleInput}`);
                } catch (err) {
                    console.log(err);
                    socket.emit('server-announcement', err);
                }
            })

            socket.on('recipe-update', async (data) => {
                try {
                    await db.query(`UPDATE recipes SET title = ?, instructions = ?, image_urls = ? WHERE OP = ? AND title = ? AND instructions = ? AND time = ?`, [data.titleInput, data.instructionsInput, JSON.stringify(data.uploadedImgs), data.origRecipe.origOP, data.origRecipe.origTitle, data.origRecipe.origInstructions, data.origRecipe.origTime]);
                    console.log(data.origRecipe.origOP + " updated recipe: " + data.origRecipe.origTitle);

                    socket.emit('display-my-recipes');
                    socket.broadcast.emit('display-all-recipes');
                    socket.emit('create-recipe-success');
                    io.emit('server-announcement', `${data.origRecipe.origOP} updated recipe: ${data.origRecipe.origTitle}`);
                } catch (err) {
                    console.log(err);
                    socket.emit('server-announcement', err);
                }
            })

            socket.on('recipe-delete', async (data) => {
                try {
                    await db.query(`DELETE FROM recipes WHERE title = ?`, [data.recipeTitle]);
                    console.log(data.nick + " deleted recipe: " + data.recipeTitle);

                    socket.emit('display-my-recipes');
                    socket.broadcast.emit('display-all-recipes');
                    io.emit('server-announcement', `${data.nick} deleted recipe: ${data.recipeTitle}`);
                } catch (err) {
                    console.log(err);
                    socket.emit('server-announcement', err);
                }
            })

            socket.on('update-password', async (data) => {
                try {
                    const [results] = await db.query(`SELECT * FROM users WHERE name = ?`, [data.nick]);

                    if (results.length > 0) {
                        const bool = bcrypt.compareSync(data.currentPassword, results[0].password);
                        if (bool) {
                            const hash = bcrypt.hashSync(data.newPassword, saltRounds);
                            await db.query(`UPDATE users SET password = ? WHERE name = ?`, [hash, data.nick]);
                            
                            socket.emit('close-modal');
                            socket.emit('server-announcement', `Your password has been updated successfully.`);
                            console.log(`${data.nick} updated their password.`);
                        } else {
                            socket.emit('incorrect-current-password');
                        }
                    }
                } catch (err) {
                    console.log(err);
                    socket.emit('server-announcement', err);
                }
            });

            socket.on('delete-account', async (nick) => {
                try {
                    await db.query(`UPDATE recipes SET OP = "" WHERE OP = ?`, [nick]);
                    await db.query(`DELETE FROM users WHERE name = ?`, [nick]);

                    socket.emit('reload');
                    socket.broadcast.emit('display-all-recipes');
                    io.emit('server-announcement', `${nick} deleted their account!`);
                    console.log(`${nick} deleted their account!`);
                } catch (err) {
                    console.log(err);
                    socket.emit('server-announcement', err);
                }
            });

            socket.on('disconnect', async () => {
                console.log('a user disconnected');

                if (socket.nickname) {
                    try {
                        await db.query(`UPDATE users SET is_online = ? WHERE name = ?`, [false, socket.nickname]);
                        socket.broadcast.emit('display-all-users');
                        io.emit('server-announcement', `- ${socket.nickname}`);
                        console.log(`- ${socket.nickname}`);
                    } catch (err) {
                        console.log(err);
                        socket.emit('server-announcement', err);
                    }
                }
            });
        });

        server.listen(port, () => {
            console.log(`server running on port ${port}`);
        });
    } catch (err) {
        console.error('Failed to start server due to DB error:', err);
        process.exit(1);
    }
})();