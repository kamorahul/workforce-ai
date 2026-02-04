const axios = require('axios');
require('dotenv').config();

const ASSISTANT_IDS = [
  { id: 'asst_wD1s9GID1EVsh7BSLZNbkdJr', purpose: 'Daily Summary' },
  { id: 'asst_iocLVsbx9oRarBKPdYbMACSY', purpose: 'Calendar/Events' },
  { id: 'asst_SIcQ1bD17QezZbQIQEzuYMhg', purpose: 'Q&A (Kai Channel)' },
  { id: 'asst_ercPXUnj2oTtMpqjk4cfJWCD', purpose: 'Task Detection' },
  { id: 'asst_IvTo37LM3gDUZ2LTXIgUBeS1', purpose: 'User Onboarding' },
  { id: 'asst_Q8vD9YOGcO3es62kFjeVZI5L', purpose: 'Test/Default' },
];

async function fetchAssistantDetails(assistantId, purpose) {
  try {
    const response = await axios.get(
      `https://api.openai.com/v1/assistants/${assistantId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      }
    );

    const data = response.data;
    return {
      id: assistantId,
      purpose: purpose,
      name: data.name,
      model: data.model,
      instructions: data.instructions,
      tools: data.tools,
      metadata: data.metadata,
    };
  } catch (error) {
    console.error(`Error fetching ${assistantId}:`, error.response?.data || error.message);
    return {
      id: assistantId,
      purpose: purpose,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

async function fetchAllAssistants() {
  console.log('='.repeat(80));
  console.log('FETCHING ALL OPENAI ASSISTANT CONFIGURATIONS');
  console.log('='.repeat(80));
  console.log('');

  const results = [];

  for (const assistant of ASSISTANT_IDS) {
    console.log(`Fetching: ${assistant.purpose} (${assistant.id})...`);
    const details = await fetchAssistantDetails(assistant.id, assistant.purpose);
    results.push(details);
  }

  console.log('\n');
  console.log('='.repeat(80));
  console.log('ASSISTANT CONFIGURATIONS');
  console.log('='.repeat(80));

  for (const result of results) {
    console.log('\n');
    console.log('-'.repeat(80));
    console.log(`📌 ${result.purpose}`);
    console.log('-'.repeat(80));

    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
      continue;
    }

    console.log(`ID: ${result.id}`);
    console.log(`Name: ${result.name || 'N/A'}`);
    console.log(`Model: ${result.model || 'N/A'}`);
    console.log('');
    console.log('📝 INSTRUCTIONS:');
    console.log('-'.repeat(40));
    console.log(result.instructions || '(No instructions)');
    console.log('-'.repeat(40));
    console.log('');
    console.log('🔧 TOOLS:');
    if (result.tools && result.tools.length > 0) {
      result.tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. Type: ${tool.type}`);
        if (tool.function) {
          console.log(`     Name: ${tool.function.name}`);
          console.log(`     Description: ${tool.function.description}`);
          if (tool.function.parameters) {
            console.log(`     Parameters: ${JSON.stringify(tool.function.parameters, null, 6)}`);
          }
        }
      });
    } else {
      console.log('  (No tools configured)');
    }
  }

  // Also save to JSON file for reference
  const fs = require('fs');
  const outputPath = './assistant-configs.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log('\n');
  console.log('='.repeat(80));
  console.log(`✅ Configurations saved to: ${outputPath}`);
  console.log('='.repeat(80));
}

// Run if executed directly
if (require.main === module) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is not set');
    console.error('Please set it in your .env file or export it:');
    console.error('  export OPENAI_API_KEY=your-key-here');
    process.exit(1);
  }

  fetchAllAssistants().catch(console.error);
}

module.exports = { fetchAssistantDetails, fetchAllAssistants };
