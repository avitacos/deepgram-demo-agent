import "dotenv/config"; // Load .env
import { ConversationManager } from "./ConversationManager";

async function runApp() {
  const manager = new ConversationManager();
  await manager.main();
  console.log("Conversation ended. Goodbye!");
}

if (require.main === module) {
  runApp().catch((err) => {
    console.error("Error running app:", err);
  });
}
