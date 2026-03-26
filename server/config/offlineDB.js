const offlineData = {
  users: [],
  vehicles: [],
  drivers: [],
  bookings: [],
  payments: []
};

const offlineDB = {
  find: (collection, query = {}) => {
    return offlineData[collection].filter(item => {
      return Object.entries(query).every(([key, value]) => item[key] === value);
    });
  },
  findOne: (collection, query = {}) => {
    const matches = offlineDB.find(collection, query);
    return matches[0] || null;
  },
  findById: (collection, id) => {
    return offlineDB.findOne(collection, { _id: id });
  },
  create: (collection, data) => {
    data._id = data._id || Date.now().toString();
    data.createdAt = data.createdAt || new Date();
    offlineData[collection].push(data);
    return data;
  },
  updateOne: (collection, query, update) => {
    const item = offlineDB.findOne(collection, query);
    if (!item) return null;
    Object.assign(item, update);
    return item;
  },
  findByIdAndUpdate: (collection, id, update) => {
    return offlineDB.updateOne(collection, { _id: id }, update);
  },
  deleteOne: (collection, query) => {
    const index = offlineData[collection].findIndex(item => {
      return Object.entries(query).every(([key, value]) => item[key] === value);
    });
    if (index === -1) return null;
    return offlineData[collection].splice(index, 1)[0];
  }
};

export default offlineDB;

