import test from 'node:test';
import assert from 'node:assert/strict';
import { demo } from '../.test-dist/model.js';
import { compileUnoPreview, sampleUnoPreview } from '../.test-dist/core/uno-preview.js';

test('default demo Blink compiles into deterministic 2000ms D13 waveform',()=>{
  const p=demo(),r=compileUnoPreview(p.code);
  assert.equal(r.ok,true,r.reason);
  assert.equal(r.periodMs,2000);
  assert.equal(r.events.length,2);
  for(const [ms,high] of [[0,true],[50,true],[999,true],[1000,false],[1999,false],
    [2000,true],[2999,true],[3000,false],[4000,true]]){
    assert.equal(sampleUnoPreview(r,ms).high,high,'at '+ms+'ms');
  }
});
test('built-in LED alias and user-defined integer pin constant resolve to D13',()=>{
  const variants=[
    'void setup(){pinMode(LED_BUILTIN,OUTPUT);} void loop(){digitalWrite(LED_BUILTIN,HIGH);delay(100);digitalWrite(LED_BUILTIN,LOW);delay(100);}',
    'const int ledPin = 13; void setup(){pinMode(ledPin,OUTPUT);} void loop(){digitalWrite(ledPin,HIGH);delay(100);digitalWrite(ledPin,LOW);delay(100);}',
    '#define LED_PIN 13\nvoid setup(){pinMode(LED_PIN,OUTPUT);} void loop(){digitalWrite(LED_PIN,HIGH);delay(100);digitalWrite(LED_PIN,LOW);delay(100);}'
  ];
  for(const text of variants){
    const r=compileUnoPreview(text);
    assert.equal(r.ok,true,r.reason);
    assert.equal(r.periodMs,200);
    assert.equal(sampleUnoPreview(r,150).high,false);
  }
});
test('comments are removed but not executed and cannot introduce forbidden statements',()=>{
  const source='/* Serial.begin(9600); */ void setup(){pinMode(13,OUTPUT);}'+
    'void loop(){// comment\n digitalWrite(13,HIGH);delay(20);digitalWrite(13,LOW);delay(20);}';
  const r=compileUnoPreview(source);
  assert.equal(r.ok,true,r.reason);
  assert.equal(sampleUnoPreview(r,10).high,true);
  const invalid=compileUnoPreview(source+'/* unclosed');
  assert.equal(invalid.ok,false);
});
test('setup output configuration is mandatory and wrong pin/mode is rejected',()=>{
  for(const setup of ['', 'pinMode(12,OUTPUT);','pinMode(13,INPUT);',
    'digitalWrite(13,HIGH);pinMode(13,OUTPUT);']){
    const r=compileUnoPreview('void setup(){'+setup+'}void loop(){digitalWrite(13,HIGH);delay(100);}');
    assert.equal(r.ok,false,setup);
  }
});
test('no eval: rejects unsupported function calls and arbitrary embedded Javascript',()=>{
  for(const payload of ['Serial.begin(9600);','fetch(13);','globalThis.hacked=1;',
    'while(1){digitalWrite(13,HIGH);}','if(true) digitalWrite(13,HIGH);',
    'digitalWrite(12,HIGH);']){
    const code='void setup(){pinMode(13,OUTPUT);}void loop(){'+payload+'delay(100);}';
    assert.equal(compileUnoPreview(code).ok,false,payload);
  }
});
test('bounded parser rejects too-long sources, duplicate and nested functions',()=>{
  const cases=[
    'x'.repeat(12001),
    'void setup(){} void setup(){} void loop(){delay(1);}',
    'void setup(){pinMode(13,OUTPUT);} void loop(){if(1){delay(5);} delay(5);}',
    'void setup(){pinMode(13,OUTPUT);}void loop(){delay(100);',
    'void setup(){pinMode(13,OUTPUT);}void loop(){'+ 'delay(1);'.repeat(128)+'}'
  ];
  for(const s of cases)assert.equal(compileUnoPreview(s).ok,false);
});
test('timing: cannot create zero-period or excessive-delay infinite loops',()=>{
  const setup='void setup(){pinMode(13,OUTPUT);}void loop(){';
  for(const body of ['digitalWrite(13,HIGH);','delay(0);',
    'digitalWrite(13,HIGH);delay(0);','delay(60001);',
    'delay(60000);delay(60000);delay(1);',
    'delay(20);digitalWrite(13,HIGH);']){
    assert.equal(compileUnoPreview(setup+body+'}').ok,false,body);
  }
});
test('delay-before-write retains previous cycle state at early phase',()=>{
  const r=compileUnoPreview('void setup(){pinMode(13,OUTPUT);}'+
    'void loop(){delay(50);digitalWrite(13,HIGH);delay(50);digitalWrite(13,LOW);delay(50);}');
  assert.equal(r.ok,true,r.reason);
  assert.equal(sampleUnoPreview(r,0).high,false);
  assert.equal(sampleUnoPreview(r,75).high,true);
  assert.equal(sampleUnoPreview(r,110).high,false);
  assert.equal(sampleUnoPreview(r,155).high,false);
  assert.equal(sampleUnoPreview(r,210).high,true);
});
test('setup may establish an initial level before any loop writes',()=>{
  const r=compileUnoPreview('void setup(){pinMode(13,OUTPUT);digitalWrite(13,HIGH);}' +
    'void loop(){delay(200);}');
  assert.equal(r.ok,true,r.reason);
  assert.equal(sampleUnoPreview(r,0).high,true);
  assert.equal(sampleUnoPreview(r,450).high,true);
});
test('preview sample rejects non-finite/negative/over-limit timestamps',()=>{
  const r=compileUnoPreview(demo().code);
  for(const time of [-1,Infinity,NaN,3600001])assert.equal(sampleUnoPreview(r,time),null);
  assert.equal(sampleUnoPreview({ok:false,reason:'unsupported'},0),null);
});
test('duplicate aliases, invalid type and unsupported preprocessors fail closed',()=>{
  const base='void setup(){pinMode(13,OUTPUT);}void loop(){delay(20);}';
  for(const code of ['#define LED_BUILTIN 13\n'+base,
    '#include <Arduino.h>\n'+base,
    '#define LED 13\n#define LED 13\n'+base,
    'int x = 13; int x = 13;'+base
  ])assert.equal(compileUnoPreview(code).ok,false);
  assert.equal(compileUnoPreview(null).ok,false);
});
