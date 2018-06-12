
module.exports = function(RED) {
    "use strict";
    var exec = require('child_process').exec;
    var spawn = require('child_process').spawn;
    var mqtt = require("mqtt")
    var fs = require("fs")
    var mqtt_option = {
        protocol: 'mqtt',
        host: 'mosquitto',
        port: 1883,
        get_url: function(){
          return `${this.protocol}://${this.host}:${this.port}`
        }
    }


    // the magic to make python print stuff immediately
    process.env.PYTHONUNBUFFERED = 1;

    var pinsInUse = {};
    var pinTypes = {"out":RED._("rpi-gpio.types.digout"), "tri":RED._("rpi-gpio.types.input"), "up":RED._("rpi-gpio.types.pullup"), "down":RED._("rpi-gpio.types.pulldown"), "pwm":RED._("rpi-gpio.types.pwmout")};

    function GPIOInNode(n) {
        RED.nodes.createNode(this,n);
        this.buttonState = -1;
        this.pin = n.pin;
        this.read = n.read || false;
        this.client = mqtt.connect(mqtt_option.get_url())
        if (this.read) { this.buttonState = -2; }
        var node = this;
        if (!pinsInUse.hasOwnProperty(this.pin)) {
            pinsInUse[this.pin] = "in";
        }
        else {
            if ((pinsInUse[this.pin] !== "in")||(pinsInUse[this.pin] === "pwm")) {
                node.warn(RED._("rpi-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
            }
        }

        if (node.pin !== undefined) {
            this.client.on('connect', () => {
                this.client.subscribe(`tsa/gpio/${node.pin}/value`)
                this.client.publish(`tsa/gpio/${node.pin}/setup`, JSON.stringify({
                    mode: 'in'
                }))

                node.status({fill:"green",shape:"dot",text:"rpi-gpio.status.ok"});
            })

            this.client.on('message', (topic, message) => {
                message = Number(message.toString())
                if(topic === `tsa/gpio/${node.pin}/value`){
                    if(node.buttonState !== -1 && !isNaN(message) && node.buttonState !== message){
                        node.send({ topic:`pi/${node.pin}`, payload:message, intent:((message===0)?0:1) });
                    }
                    node.buttonState = message;
                    node.status({fill:"green",shape:"dot",text:message});
                    if (RED.settings.verbose) { node.log(`GPIO ${node.pin} out: ${message}`); }
                }
            })
        }
        else {
            node.warn(RED._("rpi-gpio.errors.invalidpin")+": "+node.pin);
        }

        node.on("close", function(done) {
            node.status({fill:"grey",shape:"ring",text:"rpi-gpio.status.closed"});
            delete pinsInUse[node.pin];
            if (this.client) {
                this.client.unsubscribe(`tsa/gpio/${node.pin}/value`)
                this.client.end()
            }
            done();
        });
    }
    RED.nodes.registerType("rpi-gpio in",GPIOInNode);

    function GPIOOutNode(n) {
        RED.nodes.createNode(this,n);
        this.pin = n.pin;
        this.set = n.set || false;
        this.client = mqtt.connect(mqtt_option.get_url())
        var node = this;
        if (!pinsInUse.hasOwnProperty(this.pin)) {
            pinsInUse[this.pin] = "out";
        }
        else {
            if ((pinsInUse[this.pin] !== "out")||(pinsInUse[this.pin] === "pwm")) {
                node.warn(RED._("rpi-gpio.errors.alreadyset",{pin:this.pin,type:pinTypes[pinsInUse[this.pin]]}));
            }
        }

        if (node.pin !== undefined) {
            this.client.on('connect', () => {
                this.client.publish(`tsa/gpio/${node.pin}/setup`, JSON.stringify({
                    mode: 'out'
                }))

                node.status({fill:"green",shape:"dot",text:"rpi-gpio.status.ok"});
                node.on("input", function(msg){
                    var out
                    if(msg.hasOwnProperty("intent") && (msg.intent === 0 || msg.intent ===1)){
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
                        this.client.publish(`tsa/gpio/${node.pin}/value/set`, `${out}`)
                        node.status({fill:"green",shape:"dot",text:`${out}`});
                    }
                    else { node.warn(RED._("rpi-gpio.errors.invalidinput")+": "+out); }
                });
            })
        }
        else {
            node.warn(RED._("rpi-gpio.errors.invalidpin")+": "+node.pin);
        }

        node.on("close", function(done) {
            node.status({fill:"grey",shape:"ring",text:"rpi-gpio.status.closed"});
            delete pinsInUse[node.pin];
            if (this.client) {
                this.client.end()
            }
            done();
        });

    }
    RED.nodes.registerType("rpi-gpio out",GPIOOutNode);

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
                    switch (parseInt(binaryRev.substr(binaryRev.length-12,8), 2)) {
                        case 0: _pitype.type = "Model A"; _pitype.p1_revision = 2; break;
                        case 1: _pitype.type = "Model B"; _pitype.p1_revision = 2; break;
                        case 2: _pitype.type = "Model A+"; _pitype.p1_revision = 3; break;
                        case 3: _pitype.type = "Model B+"; _pitype.p1_revision = 3; break;
                        case 4: _pitype.type = "Pi 2 Model B"; _pitype.p1_revision = 3; break;
                        case 5: _pitype.type = "Alpha"; _pitype.p1_revision = 3; break;
                        case 6: _pitype.type = "Compute"; _pitype.p1_revision = 0; break;
                        case 8: _pitype.type = "Pi 3 Model B"; _pitype.p1_revision = 3; break;
                        case 9: _pitype.type = "Zero"; _pitype.p1_revision = 3; break;
                        default : _pitype.type = "Unknown"; _pitype.p1_revision = 3; break;
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
                  if (revision === "0002" || revision === "0003"){
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 1;
                     _pitype.ram = "256M";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0004") {
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "256M";
                     _pitype.manufacturer = "Sony";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0005") {
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "256M";
                     _pitype.manufacturer = "Qisda";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0006") {
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "256M";
                     _pitype.manufacturer = "Egoman";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0007") {
                     _pitype.type = "Model A";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "256M";
                     _pitype.manufacturer = "Egoman";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0008") {
                     _pitype.type = "Model A";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "256M";
                     _pitype.manufacturer = "Sony";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0009") {
                     _pitype.type = "Model A";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "256M";
                     _pitype.manufacturer = "Qisda";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "000d") {
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "512M";
                     _pitype.manufacturer = "Egoman";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "000e") {
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "512M";
                     _pitype.manufacturer = "Sony";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "000f") {
                     _pitype.type = "Model B";
                     _pitype.p1_revision = 2;
                     _pitype.ram = "512M";
                     _pitype.manufacturer = "Qisda";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0011" || revision === "0014") {
                     _pitype.type = "Compute Module";
                     _pitype.p1_revision = 0;
                     _pitype.ram = "512M";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0012") {
                     _pitype.type = "Model A+";
                     _pitype.p1_revision = 3;
                     _pitype.ram = "256M";
                     _pitype.processor = "BCM2835";
                  } else if (revision === "0010" || revision === "0013") {
                     _pitype.type = "Model B+";
                     _pitype.p1_revision = 3;
                     _pitype.ram = "512M";
                     _pitype.processor = "BCM2835";
                  } else {  // don't know - assume revision 3 p1 connector
                     _pitype.p1_revision = 3;
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
