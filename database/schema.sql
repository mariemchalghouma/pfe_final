-- Driver Tracking Database Schema
-- PostgreSQL database initialization script

-- Create users table (administrators)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

 

-- Insert sample data (optional)

-- Sample admin user (password: admin123)
-- Note: This is a hashed version of 'admin123' using bcrypt
INSERT INTO users (email, password, name) VALUES
('admin@example.com', '$2b$10$YourHashedPasswordHere', 'Administrateur')
ON CONFLICT (email) DO NOTHING;

 
