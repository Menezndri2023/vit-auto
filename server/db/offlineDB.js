// In-memory database fallback for development when MongoDB is not available
class OfflineDB {
  constructor() {
    this.collections = {
      users: [],
      vehicles: [],
      bookings: [],
    };
    this.nextIds = { users: 1, vehicles: 1, bookings: 1 };
  }

  async find(collection, query = {}) {
    const items = this.collections[collection] || [];
    return items.filter((item) => {
      return Object.entries(query).every(([key, value]) => {
        if (key === "_id" || key === "id") return String(item._id || item.id) === String(value);
        return item[key] === value;
      });
    });
  }

  async findOne(collection, query = {}) {
    const items = await this.find(collection, query);
    return items.length > 0 ? items[0] : null;
  }

  async findById(collection, id) {
    return this.findOne(collection, { _id: id });
  }

  async create(collection, data) {
    const id = this.nextIds[collection]++;
    const doc = { ...data, _id: id };
    this.collections[collection].push(doc);
    return doc;
  }

  async updateOne(collection, query, update) {
    const items = this.collections[collection] || [];
    const idx = items.findIndex((item) =>
      Object.entries(query).every(([key, value]) => item[key] === value)
    );
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...update };
      return items[idx];
    }
    return null;
  }

  async findByIdAndUpdate(collection, id, update) {
    const items = this.collections[collection] || [];
    const idx = items.findIndex((item) => item._id === id);
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...update };
      return items[idx];
    }
    return null;
  }

  async deleteOne(collection, query) {
    const items = this.collections[collection] || [];
    const idx = items.findIndex((item) =>
      Object.entries(query).every(([key, value]) => item[key] === value)
    );
    if (idx !== -1) {
      items.splice(idx, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  reset() {
    this.collections = { users: [], vehicles: [], bookings: [] };
    this.nextIds = { users: 1, vehicles: 1, bookings: 1 };
  }
}

export default new OfflineDB();
