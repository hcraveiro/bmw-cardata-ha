import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../custom_components/cardata/frontend/bmw-cardata-vehicle-card.js', import.meta.url), 'utf8');
const sandbox = {
  window: {},
  HTMLElement: class {},
  customElements: { get: () => undefined, define: () => {} },
};
runInNewContext(`${source}\nglobalThis.__cardTest = { configuredAdditionalCards, additionalCardItems, tileGrid, BmwCardataVehicleCard };`, sandbox);
const { configuredAdditionalCards, additionalCardItems, tileGrid, BmwCardataVehicleCard } = sandbox.__cardTest;

const plain = (value) => JSON.parse(JSON.stringify(value));

test('additional_cards defaults to an empty list and skips invalid entries', () => {
  assert.deepEqual(plain(configuredAdditionalCards({})), []);
  assert.deepEqual(plain(configuredAdditionalCards({ additional_cards: 'invalid' })), []);
  assert.deepEqual(plain(configuredAdditionalCards({ additional_cards: [null, {}, { entity: ' ' }, { entity: 'sensor.battery' }] })).map((item) => item.entity), ['sensor.battery']);
});

test('explicit names and icons override entity attributes; entity state is formatted by HA', () => {
  const hass = {
    states: { 'sensor.battery': { state: '9.4', attributes: { friendly_name: 'Energy', icon: 'mdi:flash', unit_of_measurement: 'kWh' } } },
    formatEntityState: () => '9,4 kWh',
  };
  const configured = additionalCardItems({ additional_cards: [
    { entity: ' sensor.battery ', name: 'Battery to Charge', icon: 'mdi:battery' },
    { entity: 'sensor.battery' },
  ] }, hass);
  assert.deepEqual(plain(configured), [
    { entity: 'sensor.battery', label: 'Battery to Charge', icon: 'mdi:battery', value: '9,4 kWh' },
    { entity: 'sensor.battery', label: 'Energy', icon: 'mdi:flash', value: '9,4 kWh' },
  ]);
});

test('unavailable or missing entities show a placeholder and fallback labels/icons', () => {
  const items = additionalCardItems({ additional_cards: [
    { entity: 'sensor.offline' },
    { entity: 'sensor.missing' },
  ] }, { states: { 'sensor.offline': { state: 'unavailable', attributes: {} } } });
  assert.deepEqual(plain(items), [
    { entity: 'sensor.offline', label: 'sensor.offline', icon: 'mdi:information-outline', value: '—' },
    { entity: 'sensor.missing', label: 'sensor.missing', icon: 'mdi:information-outline', value: '—' },
  ]);
});

test('tile HTML escapes configuration and preserves More Info entity targets', () => {
  const html = tileGrid(additionalCardItems({ additional_cards: [
    { entity: 'sensor.example', name: '<script>alert(1)</script>', icon: 'mdi:<unsafe>' },
  ] }, { states: { 'sensor.example': { state: '10', attributes: { unit_of_measurement: 'kWh' } } } }));
  assert.ok(html.includes('data-entity-id="sensor.example"'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('mdi:&lt;unsafe&gt;'));
  assert.ok(html.includes('10 kWh'));
  assert.ok(!html.includes('<script>'));
});

test('card size grows only for valid additional tiles', () => {
  const card = new BmwCardataVehicleCard();
  card.setConfig({ show_image: false, show_map: false, show_buttons: false });
  const baseSize = card.getCardSize();
  card.setConfig({ show_image: false, show_map: false, show_buttons: false, additional_cards: [
    { entity: 'sensor.one' }, { entity: 'sensor.two' }, { entity: 'sensor.three' }, {},
  ] });
  assert.ok(card.getCardSize() > baseSize);
  card.setConfig({ show_image: false, show_map: false, show_buttons: false, additional_cards: [] });
  assert.equal(card.getCardSize(), baseSize);
});
