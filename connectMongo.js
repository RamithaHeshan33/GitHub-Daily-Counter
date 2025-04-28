const mongoose = require('mongoose');

let cached = global.mongoose || { conn: null, promise: null };

async function connectMongo() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect("mongodb+srv://view_counter:CK14KeR3xJiJZfln@cluster0.2pofasq.mongodb.net/", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

global.mongoose = cached;

module.exports = connectMongo;
