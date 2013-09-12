module.exports = {
  auth: {
    fb: {
        appId: '501636539926798'
      , appSecret: '682ce79eea2191c282e2ed710b739105'
    }
  },
  db: {
    mongo: {
      protocol: "mongodb",
      host: "localhost",
      db_name: "pinteraction-express",
    }
  },
  baseURL: "http://localhost:3000",
  io: {
    client: {
      host: "localhost",
      port: 3000
    }
  },
};
