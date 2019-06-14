
module.exports = function(RED) {
    "use strict";
    var fs = require("fs")
    var isUtf8 = require('is-utf8');

    var gpioMapping = [
      { pin: 0,  gpio: null},
      { pin: 1,  gpio: null},
      { pin: 2,  gpio: null},
      { pin: 3,  gpio: 2},
      { pin: 4,  gpio: null},
      { pin: 5,  gpio: 3},
      { pin: 6,  gpio: null},
      { pin: 7,  gpio: 4},
      { pin: 8,  gpio: 14},
      { pin: 9,  gpio: null},
      { pin: 10, gpio: 15},
      { pin: 11, gpio: 17},
      { pin: 12, gpio: 18},
      { pin: 13, gpio: 27},
      { pin: 14, gpio: null},
      { pin: 15, gpio: 22},
      { pin: 16, gpio: 23},
      { pin: 17, gpio: null},
      { pin: 18, gpio: 24},
      { pin: 19, gpio: 10},
      { pin: 20, gpio: null},
      { pin: 21, gpio: 9},
      { pin: 22, gpio: 25},
      { pin: 23, gpio: 11},
      { pin: 24, gpio: 8},
      { pin: 25, gpio: null},
      { pin: 26, gpio: 7},
      { pin: 27, gpio: null},
      { pin: 28, gpio: null},
      { pin: 29, gpio: 5},
      { pin: 30, gpio: null},
      { pin: 31, gpio: 6},
      { pin: 32, gpio: 12},
      { pin: 33, gpio: 13},
      { pin: 34, gpio: null},
      { pin: 35, gpio: 19},
      { pin: 36, gpio: 16},
      { pin: 37, gpio: 26},
      { pin: 38, gpio: 20},
      { pin: 39, gpio: null},
      { pin: 40, gpio: 21}
    ]

    var pinsInUse = {};
    var pinTypes = {"out":RED._("rpi-gpio.types.digout"), "tri":RED._("rpi-gpio.types.input"), "up":RED._("rpi-gpio.types.pullup"), "down":RED._("rpi-gpio.types.pulldown"), "pwm":RED._("rpi-gpio.types.pwmout")};

    function GPIOInNode(n) {
      RED.nodes.createNode(this,n);
      this.buttonState = -1;
      this.pin = n.pin;
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
        this.topic = `tsa/gpio/${gpioMapping[node.pin].gpio}/value`
        this.brokerConn.publish({
          topic: `tsa/gpio/${gpioMapping[node.pin].gpio}/setup`,
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

        this.brokerConn.publish({
          topic: `tsa/gpio/${gpioMapping[node.pin].gpio}/setup`,
          qos: 0,
          retain: false,
          payload: JSON.stringify(setupParams)
        })

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
              this.brokerConn.publish({
                topic: `tsa/gpio/${gpioMapping[node.pin].gpio}/value/set`,
                qos: 0,
                retain: false,
                payload: `${out}`
              })
              node.status({fill:"green",shape:"dot",text:`${out}`});
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

    var pitype = { type: "" };
    fs.readFile('/proc/cpuinfo', 'utf8', function(err, data){
        if(!err){
            var _pitype = { type: "" };
            var revision
            try{
                revision = data.split('Revision')[1].split('\n')[0].split(': ')[1].trim()
            } catch(e){}
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
                        default : _pitype.type = "Unknown"; _pitype.pi = 3; break;
                    }

                    switch (parseInt(binaryRev.substr(binaryRev.length-16,4), 2)) {
                        case 0: _pitype.processor = "BCM2835"; break;
                        case 1: _pitype.processor = "BCM2836"; break;
                        case 2: _pitype.processor = "BCM2837"; break;
                        default : _pitype.processor = "Unknown"; break;
                    }
                    switch (parseInt(binaryRev.substr(binaryRev.length-20,4), 2)) {
                        case 0: _pitype.manufacturer = "Sony"; break;
                        case 1: _pitype.manufacturer = "Egoman"; break;
                        case 2: _pitype.manufacturer = "Embest"; break;
                        case 4: _pitype.manufacturer = "Embest"; break;
                        default : _pitype.manufacturer = "Unknown"; break;
                    }
                    switch (parseInt(binaryRev.substr(binaryRev.length-23,3), 2)) {
                        case 0: _pitype.ram = "256M"; break;
                        case 1: _pitype.ram = "512M"; break;
                        case 2: _pitype.ram = "1024M"; break;
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
            }
        }
    });

    RED.httpAdmin.get('/rpi-gpio/:id', RED.auth.needsPermission('rpi-gpio.read'), function(req,res) {
        res.json(pitype);
    });

    RED.httpAdmin.get('/rpi-pins/:id', RED.auth.needsPermission('rpi-gpio.read'), function(req,res) {
        res.json(pinsInUse);
    });
}
