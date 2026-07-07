class NotificationProviderInterface {
  constructor(channel, name) {
    if (!channel || !name) throw new Error("Notification provider requires channel and name.");
    this.channel = channel;
    this.name = name;
  }

  async send() {
    throw new Error(`${this.name} does not implement send.`);
  }

  async verify() {
    return { success: true, provider: this.name, channel: this.channel };
  }
}

module.exports = NotificationProviderInterface;
