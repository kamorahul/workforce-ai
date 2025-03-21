import { Schema, model, connect } from 'mongoose';

// 1. Create an interface representing a document in MongoDB.
interface IChannelAssistant {
    channelId: string;
    assistantId: string;
}

// 2. Create a Schema corresponding to the document interface.
const userSchema = new Schema<IChannelAssistant>({
    channelId: { type: String, required: true },
    assistantId: { type: String, required: true },
});

// 3. Create a Model.
const User = model<IChannelAssistant>('ChannelAssistant', userSchema);

run().catch(err => console.log(err));

async function run() {
    // 4. Connect to MongoDB
    await connect('mongodb://127.0.0.1:27017/test');

    const user = new User({
        name: 'Bill',
        email: 'bill@initech.com',
        avatar: 'https://i.imgur.com/dM7Thhn.png'
    });
    await user.save();

    console.log(user.email); // 'bill@initech.com'
}