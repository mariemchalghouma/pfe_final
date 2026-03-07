import pool from '../src/config/database.js';
import { createUser, getUsers, updateUser, deleteUser } from '../src/controllers/userController.js';

// Mocking Response for testing controllers directly
global.Response = {
    json: (data, options) => ({ data, options })
};

async function test() {
    try {
        console.log('--- Starting Backend Verification ---');

        // 1. Test Create User with Identifiant
        console.log('Testing createUser...');
        const mockReqCreate = {
            json: async () => ({
                email: `test_${Date.now()}@example.com`,
                password: 'password123',
                first_name: 'Test',
                last_name: 'User',
                identifiant: `testuser_${Date.now()}`,
                phone: '', // Optional phone
                roles: ['admin'],
                status: 'Actif'
            })
        };
        const createRes = await createUser(mockReqCreate);
        if (createRes.data.success) {
            console.log('✅ createUser successful:', createRes.data.data.identifiant);
            const userId = createRes.data.data.id;

            // 2. Test Get Users
            console.log('Testing getUsers...');
            const getRes = await getUsers();
            const found = getRes.data.data.find(u => u.id === userId);
            if (found && found.identifiant) {
                console.log('✅ getUsers found user with identifiant:', found.identifiant);
            } else {
                console.error('❌ getUsers failed to return identifiant');
            }

            // 3. Test Update User
            console.log('Testing updateUser...');
            const newIdentifiant = `updated_${Date.now()}`;
            const mockReqUpdate = {
                json: async () => ({
                    email: found.email,
                    first_name: 'Updated',
                    last_name: 'User',
                    identifiant: newIdentifiant,
                    phone: '12345678',
                    roles: ['admin'],
                    status: 'Actif'
                })
            };
            const updateRes = await updateUser(userId, mockReqUpdate);
            if (updateRes.data.success && updateRes.data.data.identifiant === newIdentifiant) {
                console.log('✅ updateUser successful:', updateRes.data.data.identifiant);
            } else {
                console.error('❌ updateUser failed');
            }

            // Clean up
            await deleteUser(userId);
            console.log('Cleanup: Test user deleted.');
        } else {
            console.error('❌ createUser failed:', createRes.data.message);
        }

        console.log('--- Verification Finished ---');
        process.exit(0);
    } catch (error) {
        console.error('❌ Verification script crashed:', error);
        process.exit(1);
    }
}

test();
