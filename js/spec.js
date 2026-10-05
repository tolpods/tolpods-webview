// TOLPOD - dimensions straight from the Tol_Pods-Product_Design sheet (inches).
// Plan frame used everywhere: x = 0..90 (left -> right), y = 0..144 (back -> ENTRANCE end), z = up.
export const SPEC = {
  pod: { W: 90, L: 144, H: 92, roof: 2, deck: 4, wheel: 6 },
  walls: { left: 3.5, right: 6.5 },
  cabin: { x0: 3.5, x1: 83.5, y0: 48, y1: 144 },          // 80 x 96 interior
  entrance: { x0: 23.5, x1: 53.5, h: 80 },               // 30" pathway
  chair: {
    width: 46, seatTop: 23, side: 4.5, centreX: 39.5, headY: 61, flatHeadY: 50.5,
    headrest: { long: 9, wide: 34, thick: 18 },
    back: { long: 30, thick: 18 },
    seat: { long: 25, thick: 23 },
    leg: { long: 18, thick: 12, hang: 49 },
    ext: { long: 12, wide: 33, thick: 6 },
    arm: { long: 15, wide: 4.5, deep: 3.5 },
    midArm: { long: 12, fromLeft: 12 },
    flat: { len: 75, withExt: 85 },
  },
  desk: { long: 21.5, wide: 10.75, joined: 43, slot: 2.5 },
  tv: { w: 43.6, h: 24.5, gapToRoof: 14, rail: 3 },
  coat: { w: 8, l: 28, h: 60 },
  block5: { l: 28, w: 18, h: 92, clearance: 3, fridge: { w: 19.1, d: 17.5, h: 31.2 }, surprise: 12.8, micro: { w: 17.3, d: 13, h: 10.2 }, cabinet: 34.8 },
  pillows: { d: 12, l: 42, h: 45, packets: 15, packet: 9, pillow: { thick: 6, w: 12, l: 14 }, blanket: 3 },
  minibar: { d: 12, l: 26, bottom: 16, top: 20, items: 36 },
  trash: { w: 20, l: 32, h: 36, cans: 4, canDia: 10, canH: 30, clearance: 6, bucket: [20, 20, 36] },
  free: { w: 12, l: 28, h: 35 },
  premium: { w: 12, l: 44, h: 92 },
  m14: { w: 39, d: 48, h: 92 }, m11: { w: 26, d: 40, h: 92 }, m13: { w: 26, d: 8, h: 92 }, m12: { w: 15, d: 48, h: 92, rows: 5 },
};

export const FEATURES = [
  ['Massage chair', 'Broad chair with three armrests and nine cupholders. Seat height adjusts 17-23". Reclines to a flat 75" bed, 85" with the leg extension.'],
  ['Pull-out desks', 'Two powered desks rise out of the armrests, rotate and join with magnets into one 43" desk.'],
  ['50" TV on a ceiling rail', 'Rolls along a sturdy ceiling rail and flips up out of the way so you can walk in.'],
  ['Premium & free storage', 'A full-height locker for a large suitcase, and a carry-on locker. Both lock from the app.'],
  ['Pillows & blankets', 'Fifteen packets in three divisions, dispensed one at a time from the app.'],
  ['Smart minibar', 'Weight-sensor shelf with 30-40 items and a cleaning-supply cabinet below.'],
  ['Fridge, microwave, surprise box', 'Mini fridge, microwave and a gift compartment for charity donations.'],
  ['Smart trash', 'Four rotating cans with compactors, a no-touch opening and a foot-lever backup.'],
  ['Two layers of smart glass', 'Optional PDLC glass: one layer to chair level, one to the top.'],
  ['Privacy cameras', 'One facing out, one facing in, each with a shutter you control from the app.'],
  ['Public side', 'Cold-drink and snack vending, refrigerated storage, a touch screen, ad screens and an items-for-sale wall.'],
  ['On wheels', 'Wheels under every component; solid locks replace them when parked.'],
];

// rows for the dimensions table on the landing page: [label, value]
export const DIM_ROWS = [
  ['Pod footprint', '90" x 144" (about 7.5 x 12 ft)'],
  ['Interior height', '92"'],
  ['Cabin interior', '80" x 96"'],
  ['Entrance / pathway', '30" wide'],
  ['Massage chair', 'Seat 25" long, 23" thick; back 30" x 18"; leg rest 18" x 12"'],
  ['Chair flat / with extension', '75" / 85"'],
  ['Pull-out desks', '2 x 21.5" x 10.75", joined 43"'],
  ['TV', '50" screen, 14" below the roof'],
  ['Free / premium storage', '12" x 28" x 35"  /  12" x 44" x 92"'],
  ['Fridge & microwave block', '28" x 18" x 92"'],
  ['Pillows & blankets', '12" x 42" x 45", 15 packets'],
  ['Weight-sensor minibar', '12" x 26" x 36"'],
  ['Trash', '20" x 32" x 36", four 10" cans'],
  ['Vending (cold / snacks)', '39" x 48" x 92"  /  15" x 48" x 92"'],
];

// numbered hotspots in the explorer: position in plan inches, text for the info panel
export const HOTSPOTS = [
  { id: '1', title: 'Massage chair', pos: [39.5, 82, 52], dims: ['Seat 25" long, 37" wide, 23" thick', 'Back 30" long, 18" thick; headrest 9" x 18"', 'Leg rest 18" x 12"; extension 12" x 6"', 'Flat: 75"  /  85" with extension'], text: 'Three armrests with three cupholders each. Use the recline control to see it flatten into a bed.' },
  { id: '2', title: 'Pull-out desks', pos: [39.5, 78, 38], dims: ['Each half 21.5" x 10.75"', 'Joined: 43" x 10.75"', '2.5" armrest slots'], text: 'Powered desks come up out of the armrests, rotate, and lock together with magnets.' },
  { id: '3', title: 'TV on ceiling rail', pos: [39.5, 100, 84], dims: ['50" screen (43.6" x 24.5")', '14" below the roof', '3" ceiling rail'], text: 'Stowed over the pathway for walking in, rolled out to watch from the chair.' },
  { id: '4', title: 'Coat station', pos: [19.5, 130, 62], dims: ['8" x 28" x 60"', 'Full-length mirror'], text: 'Hangers and hooks, with a mirror on the back wall.' },
  { id: '5', title: 'Fridge, microwave, surprise box', pos: [62.5, 130, 96], dims: ['Block 28" x 18" x 92"', 'Fridge 19.1" x 17.5" x 31.2"', 'Microwave 17.3" x 13" x 10.2"', 'Surprise box 12.8" high'], text: 'Mini fridge, microwave, a gift compartment for charity, and a cabinet for tall-people or office items.' },
  { id: '8', title: 'Pillows & blankets', pos: [9.5, 95, 70], dims: ['12" x 42" x 45"', '3 divisions x 5 packets', 'Packet 9" (6" pillow + 3" blanket)'], text: 'Dispensed one packet at a time from the app.' },
  { id: '9', title: 'Weight-sensor minibar', pos: [9.5, 61, 42], dims: ['12" x 26" x 36"', 'Top box 20", cabinet 16"', '36 items'], text: 'Smart shelf that charges you for what you lift. Cleaning supplies below.' },
  { id: '10', title: 'Smart trash', pos: [73.5, 84, 44], dims: ['20" x 32" x 36"', '4 cans, 10" dia x 30"', '6" clearance for the rotator'], text: 'Four rotating cans with compactors and a no-touch opening.' },
  { id: 'P', title: 'Premium storage', pos: [77.5, 108, 96], dims: ['12" x 44" x 92"'], text: 'Full-height locker for a large suitcase, opens from inside the pod.' },
  { id: 'F', title: 'Free storage', pos: [9.5, 130, 40], dims: ['12" x 28" x 35"'], text: 'Carry-on locker, opens from outside at the front.' },
  { id: '14', title: 'Refrigerated vending', pos: [23, -2, 96], dims: ['39" x 48" x 92"', 'Opens inside and outside'], text: 'Cold drinks and snacks, with free and paid items.' },
  { id: '11', title: 'Refrigerated storage', pos: [55.5, -2, 96], dims: ['26" x 40" x 92"'], text: 'Cold stock for restocking the machines.' },
  { id: '13', title: 'Touch screen', pos: [55.5, -2, 80], dims: ['26" x 8" x 92"'], text: 'Interactive screen for ads and content.' },
  { id: '12', title: 'Snack vending', pos: [76, -2, 96], dims: ['15" x 48" x 92"', '5 rows + 20" drop bay'], text: 'Small items and snacks.' },
  { id: '15', title: 'Free items', pos: [-4, 108, 80], dims: ['Left wall, 3.5" deep'], text: 'Free samples for people passing by.' },
  { id: '16', title: 'Ad screen', pos: [-4, 36, 70], dims: ['Left wall'], text: 'Regular TV for ads.' },
  { id: '17', title: 'Items for sale', pos: [94, 100, 86], dims: ['Right wall, 6.5" deep'], text: 'Display wall for items for sale, visible from outside.' },
];
