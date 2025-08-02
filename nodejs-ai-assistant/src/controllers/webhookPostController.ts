import express, { Request, Response, Router } from 'express';
import { createAgent, User } from '../agents/createAgent'; // Assuming this is the correct path

const router: Router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {message, user, channel} = req.body;
  console.log("Body:", req.body);

  const agent = await createAgent(user as User, channel.type, channel.id);

  if(user.id === 'kai' || channel.id.indexOf('kai') !== 0) {
    // If the user is 'kai' or the channel is not related to 'kai',
    // the original code sends back the request body and returns.
    // This behavior is replicated here.
    res.json(req.body);
    return;
  }

  await agent.init("asst_Q8vD9YOGcO3es62kFjeVZI5L");
  if(message.attachments.length > 0) {
    agent.handleMessage(
      `${message.text}: ${message.attachment[0].toString()}`
    );
    return;
  }
  agent.handleMessage(
      message.text
  );

  // The original handler doesn't explicitly send a response here if it's not the 'kai' case.
  // However, typical Express handlers should end the response.
  // If agent.handleMessage is asynchronous and handles the response, this is fine.
  // If not, a res.json({}) or similar might be needed.
  // For now, strictly replicating the observed behavior.
  // If the original code relied on a timeout or Stream's specific behavior to close this,
  // that might need further investigation if issues arise.
  // Adding a default response if headers haven't been sent, to be safe.
  if (!res.headersSent) {
    // It seems the intention of the original code might be that `agent.handleMessage`
    // would eventually send a response or that no response is needed for this path
    // after `handleMessage` is called.
    // However, to prevent hanging, we send a minimal response if nothing else has.
    // A more specific response might be required depending on `agent.handleMessage`'s design.
    res.status(200).json({ message: "Webhook processed" });
  }
});

export default router;
