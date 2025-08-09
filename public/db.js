import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2';

export const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
	ssl: {
    	minVersion: 'TLSv1.2'
    }
})

export const connectToDB = () => {
	return new Promise((resolve, reject) => {
		db.connect(err => {
			if (err) {
				console.error('MySQL connection failed:', err);
				return reject(err);
			}
			
			console.log('Connected to MySQL database.');

			const createUsersTableSQL = `
				CREATE TABLE IF NOT EXISTS users (
					id INT AUTO_INCREMENT PRIMARY KEY,
					name VARCHAR(20) CHARACTER SET utf8mb4 UNIQUE NOT NULL,
					password VARCHAR(60) NOT NULL,
					is_online BOOLEAN DEFAULT FALSE NOT NULL
				);
			`;
			db.query(createUsersTableSQL, (err) => {
				if (err) {
					console.error('Error creating users table:', err);
				} else {
					console.log('Users table confirmed.');
				}
			});

			const createRecipesTableSQL = `
				CREATE TABLE IF NOT EXISTS recipes (
					id INT AUTO_INCREMENT PRIMARY KEY,
					OP VARCHAR(20) CHARACTER SET utf8mb4 NOT NULL, 
					title VARCHAR(64),
					instructions TEXT,
					image_urls VARCHAR(500),
					time TIMESTAMP
				);
			`;
			db.query(createRecipesTableSQL, (err) => {
				if (err) {
					console.error('Error creating recipes table:', err);
				} else {
					console.log('Recipes table confirmed.');
				}
			});

			resolve();
		});
	});
};

export default db;