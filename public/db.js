import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

export const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
	ssl: {
    	minVersion: 'TLSv1.2'
    },
	waitForConnections: true,
	connectionLimit: 5,
	queueLimit: 0
})

export async function connectToDB() {
	try {
		await db.query(`
			CREATE TABLE IF NOT EXISTS users (
				id INT AUTO_INCREMENT PRIMARY KEY,
				name VARCHAR(20) CHARACTER SET utf8mb4 UNIQUE NOT NULL,
				password VARCHAR(60) NOT NULL,
				is_online BOOLEAN DEFAULT FALSE NOT NULL
			)
		`);
		console.log("Users table confirmed.");

		await db.query(`
			CREATE TABLE IF NOT EXISTS recipes (
				id INT AUTO_INCREMENT PRIMARY KEY,
				OP VARCHAR(20) CHARACTER SET utf8mb4 NOT NULL, 
				title VARCHAR(64),
				instructions TEXT,
				image_urls VARCHAR(500),
				time TIMESTAMP
			)
		`);
		console.log("Recipes table confirmed.");

	} catch (err) {
		console.error("Error initializing DB:", err);
		throw err;
	}
}

export default db;