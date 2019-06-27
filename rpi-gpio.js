
module.exports = function(RED) {
    "use strict";
    var fs = require("fs")
    var isUtf8 = require('is-utf8');

    var gpioMapping = {}

    gpioMapping.b = {
       "0": null,    "1": null,    "2": null,    "3": "2",     "4": null,
       "5": "3",     "6": null,    "7": "4",     "8": "14",    "9": null,
      "10": "15",   "11": "17",   "12": "18",   "13": "27",   "14": null,
      "15": "22",   "16": "23",   "17": null,   "18": "24",   "19": "10",
      "20": null,   "21": "9",    "22": "25",   "23": "11",   "24": "8",
      "25": null,   "26": "7",    "27": null,   "28": null,   "29": "5",
      "30": null,   "31": "6",    "32": "12",   "33": "13",   "34": null,
      "35": "19",   "36": "16",   "37": "26",   "38": "20",   "39": null,
      "40": "21"
    }

    gpioMapping.cm = {
       "0": null,    "1": null,    "2": null,    "3": null,    "4": null,
       "5": null,    "6": null,    "7": null,    "8": null,    "9": null,
      "10": null,   "11": null,   "12": null,   "13": null,   "14": null,
      "15": null,   "16": null,   "17": null,   "18": null,   "19": null,
      "20": null,   "21": "6",    "22": null,   "23": null,   "24": null,
      "25": null,   "26": null,   "27": null,   "28": "28",   "29": "5",
      "30": "29",   "31": null,   "32": null,   "33": null,   "34": "30",
      "35": null,   "36": "31",   "37": null,   "38": null,   "39": null,
      "40": null,   "41": null,   "42": null,   "43": null,   "44": null,
      "45": "12",   "46": "32",   "47": null,   "48": "33",   "49": null,
      "50": null,   "51": null,   "52": "34",   "53": null,   "54": "35",
      "55": null,   "56": null,   "57": null,   "58": "36",   "59": null,
      "60": null,   "61": null,   "62": null,   "63": null,   "64": null,
      "65": null,   "66": null,   "67": null,   "68": null,   "69": null
    }

    var pinsInUse = {};
    var pinTypes = {"out":RED._("rpi-gpio.types.digout"), "tri":RED._("rpi-gpio.types.input"), "up":RED._("rpi-gpio.types.pullup"), "down":RED._("rpi-gpio.types.pulldown"), "pwm":RED._("rpi-gpio.types.pwmout")};

    function GPIOInNode(n) {
      RED.nodes.createNode(this,n);
      this.buttonState = -1;
      this.pin = n.pin;
      this.piModel = n.piModel;
      this.read = n.read || false;
      this.broker = n.broker;
      this.brokerConn = RED.nodes.getNode(this.broker);
      if (this.read) { this.buttonState = -2; }
      var node = this;
      if(!pinsInUse.hasOwnProperty(this.pin)) {
        pinsInUse[this.pin] = "in";
      } else if((pinsInUse[this.pin] !== "in")||(pinsInUse[this.pin] === "pwm")) {
        node.warn(RED._("rpi-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
      }
      this.topic
      var node = this;
      var setupParams = {
          mode: 'in'
      }

      if(this.brokerConn && node.pin !== undefined) {
        node.brokerConn.register(node);
        node.status({fill:"green",shape:"dot",text:"rpi-gpio.status.ok"});
        getPiModel()
        .then(data => {
          if(!data || !data.gpio_type){
            return
          }
          if(data.gpio_type===node.piModel){
            this.topic = `tsa/gpio/${gpioMapping[node.piModel][node.pin]}/value`
            this.brokerConn.publish({
              topic: `tsa/gpio/${gpioMapping[node.piModel][node.pin]}/setup`,
              qos: 0,
              retain: false,
              payload: JSON.stringify(setupParams)
            })

            this.brokerConn.subscribe(this.topic, 0, function(topic, payload, packet) {
              if(isUtf8(payload)) {
                payload = payload.toString();
              }
              payload = Number(payload)
              if(node.buttonState !== -1 && !isNaN(payload) && node.buttonState !== payload){
                  node.send({ topic:`pi/${node.pin}`, payload:payload, intent:((payload===0)?0:1) });
              }
              node.buttonState = payload;
              node.status({fill:"green",shape:"dot",text:payload});
            })
          } else {
            node.warn("Your device has changed, please reconfigure you gpio nodes.")
          }
        })
        .catch()
      } else if(node.pin == undefined) {
        node.warn(RED._("rpi-gpio.errors.invalidpin")+": "+node.pin);
      }

      node.on("close", function(done) {
        node.status({fill:"grey",shape:"ring",text:"rpi-gpio.status.closed"});
        if(node.pin !== undefined){
          delete pinsInUse[node.pin];
        }

        if(node.brokerConn) {
          if(node.topic){
            node.brokerConn.unsubscribe(node.topic, node.id);
          }
          node.brokerConn.deregister(node, done);
        } else {
          done();
        }
      });
    }
    RED.nodes.registerType("rpi-gpio in", GPIOInNode);

    function GPIOOutNode(n) {
      RED.nodes.createNode(this,n);
      this.pin = n.pin;
      this.piModel = n.piModel;
      this.set = n.set || false;;
      this.level = Number(n.level) || 0;
      this.broker = n.broker;
      this.brokerConn = RED.nodes.getNode(this.broker);
      var node = this;
      if(!pinsInUse.hasOwnProperty(this.pin)) {
        pinsInUse[this.pin] = "out";
      } else if ((pinsInUse[this.pin] !== "out")||(pinsInUse[this.pin] === "pwm")) {
        node.warn(RED._("rpi-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
      }

      var setupParams = {
        mode: 'out'
      }
      if(node.set){
        setupParams.initial = node.level
      }

      if(this.brokerConn && node.pin !== undefined) {
        node.brokerConn.register(node);
        node.status({fill:"green",shape:"dot",text:"rpi-gpio.status.ok"});

        getPiModel()
        .then(data => {
          if(!data || !data.gpio_type){
            return
          }
          if(data.gpio_type===node.piModel){
            node.brokerConn.publish({
              topic: `tsa/gpio/${gpioMapping[node.piModel][node.pin]}/setup`,
              qos: 0,
              retain: false,
              payload: JSON.stringify(setupParams)
            })
          } else {
            node.warn("Your device has changed, please reconfigure you gpio nodes.")
          }
        })
        .catch()

        node.on("input", function(msg){
            var out
            if(msg.hasOwnProperty("intent") && (msg.intent == 0 || msg.intent == 1)){
              out = Number(msg.intent)
            } else {
              if (msg.payload === "true") { msg.payload = true; }
              if (msg.payload === "false") { msg.payload = false; }
              try{
                out = Math.round(Number(msg.payload));
              } catch(e){}
            }
            var limit = 1;
            if ((out >= 0) && (out <= limit)) {
              getPiModel()
              .then(data => {
                if(!data || !data.gpio_type){
                  return
                }
                if(data.gpio_type===node.piModel){
                  node.brokerConn.publish({
                    topic: `tsa/gpio/${gpioMapping[node.piModel][node.pin]}/value/set`,
                    qos: 0,
                    retain: false,
                    payload: `${out}`
                  })
                  node.status({fill:"green",shape:"dot",text:`${out}`});
                } else {
                  node.warn("Your device has changed, please reconfigure you gpio nodes.")
                }
              })
              .catch()
            }
            else { node.warn(RED._("rpi-gpio.errors.invalidinput")+": "+out); }
          });
      } else if(node.pin == undefined) {
        node.warn(RED._("rpi-gpio.errors.invalidpin")+": "+node.pin);
      }

      node.on("close", function(done){
        node.status({fill:"grey",shape:"ring",text:"rpi-gpio.status.closed"});
        if(node.pin !== undefined){
          delete pinsInUse[node.pin];
        }

        if(node.brokerConn) {
          node.brokerConn.deregister(node, done);
        } else {
          done();
        }
      });
    }
    RED.nodes.registerType("rpi-gpio out", GPIOOutNode);

    var modelToType = [
      {
        name: 'zero',
        types: ['Zero', 'Zero+'],
        supported: false
      },
      {
        name: 'a',
        types: ['A', 'A+'],
        supported: false
      },
      {
        name: 'b',
        types: ['B', 'B+', 'Unknown'],
        supported: true
      },
      {
        name: 'cm',
        types: ['CM', 'CM+'],
        supported: true
      },
      {
        name: 'unknown',
        types: ['Alpha', 'Internal'],
        supported: false
      }
    ]

    var pitype = null;

    function getPiModel(){
      return new Promise( (resolve, reject) => {
        if(pitype !== null){
          resolve(pitype)
        }
        else{
          fs.readFile('/proc/cpuinfo', 'utf8', function(err, data){
              if(!err){
                  var _pitype = { type: "" };
                  var revision
                  try{
                      revision = data.split('Revision')[1].split('\n')[0].split(': ')[1].trim()
                  } catch(e){
                    reject(e)
                  }
                  if(revision){
                      if(revision.length === 6){
                          var binaryRev = ""
                          revision.match(/.{1,2}/g).forEach(str => {
                              binaryRev += ("00000000" + (parseInt(str, 16)).toString(2)).substr(-8);
                          })
                          _pitype.rev = parseInt(binaryRev.substr(binaryRev.length-4,4), 2)
                          switch (parseInt(binaryRev.substr(binaryRev.length-12,8), 2).toString(16)) {
                              case '0': _pitype.type = "A"; _pitype.pi = 1; break;
                              case '1': _pitype.type = "B"; _pitype.pi = 1; break;
                              case '2': _pitype.type = "A+"; _pitype.pi = 1; break;
                              case '3': _pitype.type = "B+"; _pitype.pi = 1; break;
                              case '4': _pitype.type = "B"; _pitype.pi = 2; break;
                              case '5': _pitype.type = "Alpha"; _pitype.pi = -1; break;
                              case '6': _pitype.type = "CM"; _pitype.pi = 1; break;
                              case '8': _pitype.type = "B"; _pitype.pi = 3; break;
                              case '9': _pitype.type = "Zero"; _pitype.pi = 0; break;
                              case 'a': _pitype.type = "CM"; _pitype.pi = 3; break;
                              case 'c': _pitype.type = "Zero W"; _pitype.pi = 0; break;
                              case 'd': _pitype.type = "B+"; _pitype.pi = 3; break;
                              case 'e': _pitype.type = "A+"; _pitype.pi = 3; break;
                              case 'f': _pitype.type = "Internal"; _pitype.pi = -1; break;
                              case '10': _pitype.type = "CM+"; _pitype.pi = 3; break;
                              case '11': _pitype.type = "B"; _pitype.pi = 4; break;
                              default : _pitype.type = "Unknown"; _pitype.pi = 3; break;
                          }

                          switch (parseInt(binaryRev.substr(binaryRev.length-16,4), 2)) {
                              case 0: _pitype.processor = "BCM2835"; break;
                              case 1: _pitype.processor = "BCM2836"; break;
                              case 2: _pitype.processor = "BCM2837"; break;
                              case 3: _pitype.processor = "BCM2711"; break;
                              default : _pitype.processor = "Unknown"; break;
                          }
                          switch (parseInt(binaryRev.substr(binaryRev.length-20,4), 2)) {
                              case 0: _pitype.manufacturer = "Sony US"; break;
                              case 1: _pitype.manufacturer = "Egoman"; break;
                              case 2: _pitype.manufacturer = "Embest"; break;
                              case 3: _pitype.manufacturer = "Sony Japan"; break;
                              case 4: _pitype.manufacturer = "Embest"; break;
                              case 5: _pitype.manufacturer = "Stadium"; break;
                              default : _pitype.manufacturer = "Unknown"; break;
                          }
                          switch (parseInt(binaryRev.substr(binaryRev.length-23,3), 2)) {
                              case 0: _pitype.ram = "256M"; break;
                              case 1: _pitype.ram = "512M"; break;
                              case 2: _pitype.ram = "1024M"; break;
                              case 3: _pitype.ram = "2048M"; break;
                              case 4: _pitype.ram = "4096M"; break;
                              default: _pitype.ram = "Unknown"; break;
                          }
                      }
                      else if(revision.length === 4){
                        _pitype.pi = 1;
                        if (revision === "0002" || revision === "0003"){
                           _pitype.type = "Model B";
                           _pitype.rev = 1;
                           _pitype.ram = "256M";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0004") {
                           _pitype.type = "Model B";
                           _pitype.rev = 2;
                           _pitype.ram = "256M";
                           _pitype.manufacturer = "Sony";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0005") {
                           _pitype.type = "Model B";
                           _pitype.rev = 2;
                           _pitype.ram = "256M";
                           _pitype.manufacturer = "Qisda";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0006") {
                           _pitype.type = "Model B";
                           _pitype.rev = 2;
                           _pitype.ram = "256M";
                           _pitype.manufacturer = "Egoman";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0007") {
                           _pitype.type = "Model A";
                           _pitype.rev = 2;
                           _pitype.ram = "256M";
                           _pitype.manufacturer = "Egoman";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0008") {
                           _pitype.type = "Model A";
                           _pitype.rev = 2;
                           _pitype.ram = "256M";
                           _pitype.manufacturer = "Sony";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0009") {
                           _pitype.type = "Model A";
                           _pitype.rev = 2;
                           _pitype.ram = "256M";
                           _pitype.manufacturer = "Qisda";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "000d") {
                           _pitype.type = "Model B";
                           _pitype.rev = 2;
                           _pitype.ram = "512M";
                           _pitype.manufacturer = "Egoman";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "000e") {
                           _pitype.type = "Model B";
                           _pitype.rev = 2;
                           _pitype.ram = "512M";
                           _pitype.manufacturer = "Sony";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "000f") {
                           _pitype.type = "Model B";
                           _pitype.rev = 2;
                           _pitype.ram = "512M";
                           _pitype.manufacturer = "Qisda";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0011" || revision === "0014") {
                           _pitype.type = "Compute Module";
                           _pitype.rev = 0;
                           _pitype.ram = "512M";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0012") {
                           _pitype.type = "Model A+";
                           _pitype.rev = 3;
                           _pitype.ram = "256M";
                           _pitype.processor = "BCM2835";
                        } else if (revision === "0010" || revision === "0013") {
                           _pitype.type = "Model B+";
                           _pitype.rev = 3;
                           _pitype.ram = "512M";
                           _pitype.processor = "BCM2835";
                        } else {  // don't know - assume revision 3 p1 connector
                           _pitype.rev = 3;
                        }
                      }
                      pitype = _pitype
                      var index = modelToType.findIndex(item => item.types.indexOf(pitype.type) !== -1)
                      if(index !== -1 && modelToType[index].supported){
                        pitype.gpio_type = modelToType[index].name
                      }
                      resolve(pitype)
                  }
              } else {
                reject(err)
              }
          })
        }
      })
    }

    getPiModel().then().catch()

    RED.httpAdmin.get('/rpi-gpio/:id', RED.auth.needsPermission('rpi-gpio.read'), function(req,res) {
      getPiModel()
      .then(data => {
        res.json(pitype)
      })
      .catch(err => {
        console.log(err)
        res.json({})
      })
    });

    RED.httpAdmin.get('/rpi-pins/:id', RED.auth.needsPermission('rpi-gpio.read'), function(req,res) {
        res.json(pinsInUse);
    });
}
