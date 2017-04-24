export default class PipeLine {
  constructor(spiderCore) {
    this.spiderCore = spiderCore;
    this.logger = spiderCore.settings.logger;
  }

  assembly = async () => {
    return true;
  }

  save = async () => {
    return true;
  }

  save_links = async () => {
    return true;
  }

  save_content = async () => {
    return true;
  }
}