"""Independent nodal verification. Usage: python tests/ngspice-check.py NODE NGSPICE"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import numpy as np

node, ngspice = sys.argv[1:3]
source = '''
import {solveResistors, analyze, defaults, parseValue} from './lib/filters.ts';
const cases=[];
for(const topology of ['sk','mfb'])for(const kind of ['lowpass','highpass'])for(const q of [.541196100146197,1.3065629648763764,4]){
 const d=defaults(topology,kind,q);
 const c={c1:parseValue(d.c1),c2:parseValue(d.c2),c3:parseValue(d.c3)};
 const v=solveResistors(topology,kind,{f0:1000,q},c);
 cases.push({topology,kind,...analyze(topology,kind,v)});
}
cases.push({topology:'mfb',kind:'highpass',...analyze('mfb','highpass',{r1:10000,r2:20000,r3:0,c1:100e-9,c2:50e-9,c3:30e-9})});
cases.push({topology:'mfb',kind:'lowpass',...analyze('mfb','lowpass',{r1:10000,r2:20000,r3:30000,c1:10e-9,c2:100e-9,c3:0})});
console.log(JSON.stringify(cases));
'''
run = subprocess.run([node, '--experimental-strip-types', '--input-type=module', '-e', source], capture_output=True, text=True, check=True)
cases=json.loads(run.stdout)
max_error=0
with tempfile.TemporaryDirectory(prefix='filter-nodal-check-') as directory:
 for case in cases:
  v=case['values']
  if case['topology']=='sk':
   amp='EOP out 0 inp 0 1'
   if case['kind']=='lowpass':
    nodes={'r1':('vin','x'),'r2':('x','inp'),'c1':('x','out'),'c2':('inp','0')}
   else:
    nodes={'c1':('vin','x'),'c2':('x','inp'),'r1':('x','out'),'r2':('inp','0')}
  else:
   # High-gain differential source enforces the virtual-ground summing node.
   amp='EOP out 0 0 inv 1e12'
   if case['kind']=='lowpass':
    nodes={'r1':('vin','x'),'r2':('out','x'),'r3':('x','inv'),'c1':('out','inv'),'c2':('x','0')}
   else:
    nodes={'c1':('vin','x'),'c2':('x','out'),'c3':('x','inv'),'r1':('out','inv'),'r2':('x','0')}
  lines=['* Independent node-level filter verification','VIN vin 0 AC 1',amp]
  for name,(a,b) in nodes.items():lines.append(f'{name} {a} {b} {v[name]:.15g}')
  lines+=['.control','set wr_singlescale','ac dec 10 1 1e6','wrdata result.txt v(out)','quit','.endc','.end']
  run=subprocess.run([ngspice,'-b'],input='\n'.join(lines)+'\n',capture_output=True,text=True,cwd=directory,check=True)
  data=np.loadtxt(Path(directory)/'result.txt')
  freq=data[:,0]; actual=data[:,1]+1j*data[:,2]
  z=1j*freq/case['f0']
  expected=case['gain']*(z*z if case['kind']=='highpass' else 1)/(z*z+z/case['q']+1)
  err=float(np.max(abs((actual-expected)/expected)))
  assert err<2e-6,(case,err)
  max_error=max(max_error,err)
print(f'{len(cases)} independent ngspice circuits passed; maximum relative complex response error {max_error:.3g}')
