var os = require('os');
var pty = require('node-pty');

var shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

var ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});

ptyProcess.write('source ' + process.env.HOME + '/.bash_profile\r');

const PATH = process.env.HOME + "/bnbbridge/cli/node-binary/"
const FILE = "tbnbcli"

exports.ptyProcess = ptyProcess
exports.PATH = PATH
exports.FILE = FILE
