/**
 * Test script para generar scripts con IA
 * Corre con: bunx tsx scripts/test-ai-generation.ts
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000';

async function testAiScriptGeneration() {
  try {
    console.log('🧪 Iniciando pruebas de generación de scripts con IA...\n');

    // Test 1: Obtener contexto
    console.log('📋 Test 1: Obtener contexto de scripts');
    const contextRes = await fetch(`${API_URL}/scripts/context/team-test-123`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
    });

    if (!contextRes.ok) {
      console.log(`❌ Error ${contextRes.status}:`, await contextRes.text());
      return;
    }

    const context = await contextRes.json();
    console.log('✅ Contexto obtenido');
    console.log(`  - Brick types: ${Object.keys(context.brickTypes).length}`);
    console.log(`  - Node types: ${context.nodeTypes.length}`);
    console.log(`  - Available databases: ${context.availableDatabases.length}\n`);

    // Mostrar algunos brick types
    const sampleBricks = Object.entries(context.brickTypes).slice(0, 3);
    console.log('Muestra de brick types:');
    for (const [key, brick] of sampleBricks) {
      console.log(`  - ${brick.displayName} (${brick.kind})`);
    }
    console.log('');

    // Mostrar algunos node types
    console.log('Muestra de node types:');
    context.nodeTypes.slice(0, 5).forEach((node) => {
      console.log(`  - ${node.displayName} (${node.kind})`);
    });
    console.log('');

    // Test 2: Generar script con IA
    console.log('🤖 Test 2: Generar script con prompt natural');
    const generateRes = await fetch(`${API_URL}/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        userPrompt: 'Crea un script que guarde datos de un formulario en una base de datos cuando se envíe',
        teamId: 'team-test-123',
      }),
    });

    if (!generateRes.ok) {
      console.log(`❌ Error ${generateRes.status}:`, await generateRes.text());
      return;
    }

    const generatedScript = await generateRes.json();
    console.log('✅ Script generado');
    console.log(`  - Nombre: ${generatedScript.name || 'N/A'}`);
    console.log(`  - Nodos: ${generatedScript.nodes?.length || 0}`);
    console.log(`  - Conexiones: ${generatedScript.connections?.length || 0}\n`);

    // Mostrar estructura de nodos
    if (generatedScript.nodes && generatedScript.nodes.length > 0) {
      console.log('Estructura de nodos generados:');
      generatedScript.nodes.forEach((node, idx) => {
        console.log(`  ${idx + 1}. ${node.label || node.id} (${node.kind})`);
      });
      console.log('');
    }

    // Mostrar conexiones
    if (generatedScript.connections && generatedScript.connections.length > 0) {
      console.log('Conexiones entre nodos:');
      generatedScript.connections.forEach((conn) => {
        console.log(`  ${conn.source} → ${conn.target}`);
      });
      console.log('');
    }

    console.log('✨ Todas las pruebas completadas exitosamente!');
  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
  }
}

testAiScriptGeneration();
