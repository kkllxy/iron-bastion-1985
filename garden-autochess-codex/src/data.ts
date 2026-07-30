export type PlantId='sunbud'|'burstpod'|'emberbloom'|'frostfern'|'shellroot'|'razorvine'|'mirecap'|'sporebell'|'voltaloes'|'bulbapult'|'steamwing'|'solargourd';
export type EnemyId='muckling'|'scrapmite'|'drumcan'|'smogwisp'|'blightbug'|'jumprat'|'crusher'|'signalbeast';
export type Role='sun'|'shooter'|'wall'|'aura'|'lobber';
export interface PlantDef{id:PlantId;name:string;icon:string;color:string;cost:number;role:Role;hp:number;damage:number;rate:number;tags:string[];desc:string;sun?:number;slow?:number;area?:number;graft?:boolean}
export interface EnemyDef{id:EnemyId;name:string;color:string;hp:number;speed:number;damage:number;reward:number;score:number;armor?:number;special?:string}

export const PLANTS:Record<PlantId,PlantDef>={
  sunbud:{id:'sunbud',name:'辉光芽',icon:'✹',color:'#f2ca52',cost:40,role:'sun',hp:70,damage:0,rate:6,tags:['日光'],desc:'周期产出阳光，邻接攻击植物可令攻击回收阳光。',sun:22},
  burstpod:{id:'burstpod',name:'爆豆荚',icon:'●',color:'#91c95a',cost:85,role:'shooter',hp:105,damage:24,rate:1.25,tags:['射击'],desc:'稳定的单线远程火力。'},
  emberbloom:{id:'emberbloom',name:'烬焰花',icon:'♨',color:'#f26d3d',cost:135,role:'shooter',hp:90,damage:33,rate:1.65,tags:['火'],desc:'灼烧目标；邻接冰系时转为蒸汽爆破。',area:.45},
  frostfern:{id:'frostfern',name:'霜脉蕨',icon:'❄',color:'#70cde7',cost:130,role:'shooter',hp:95,damage:17,rate:1.45,tags:['冰'],desc:'冻结污染物，显著降低移动速度。',slow:.45},
  shellroot:{id:'shellroot',name:'甲壳根',icon:'⬢',color:'#b99562',cost:55,role:'wall',hp:620,damage:0,rate:9,tags:['墙'],desc:'厚重根甲阻断路线，保护后排。'},
  razorvine:{id:'razorvine',name:'锯齿藤',icon:'〽',color:'#43a765',cost:110,role:'shooter',hp:115,damage:16,rate:1.35,tags:['藤'],desc:'甲壳根后方联动时产生高额反伤。'},
  mirecap:{id:'mirecap',name:'泥沼伞',icon:'♠',color:'#9b64c8',cost:115,role:'shooter',hp:90,damage:13,rate:1.3,tags:['菌'],desc:'叠加腐蚀孢子；菌类环阵共享攻速。'},
  sporebell:{id:'sporebell',name:'孢铃',icon:'♣',color:'#d28dde',cost:125,role:'aura',hp:100,damage:10,rate:.8,tags:['菌'],desc:'持续侵蚀邻近路线上的敌人。',area:1.8},
  voltaloes:{id:'voltaloes',name:'电弧芦',icon:'ϟ',color:'#e8dc54',cost:165,role:'shooter',hp:90,damage:21,rate:.9,tags:['电'],desc:'电弧会在同路线敌人之间弹射。',area:.25},
  bulbapult:{id:'bulbapult',name:'鳞茎投手',icon:'◉',color:'#c491d6',cost:180,role:'lobber',hp:100,damage:42,rate:2.1,tags:['投掷'],desc:'抛射鳞茎，对成群敌人造成范围伤害。',area:1.1},
  steamwing:{id:'steamwing',name:'蒸汽翼花',icon:'☁',color:'#d8f1ee',cost:0,role:'shooter',hp:135,damage:50,rate:1.65,tags:['火','冰','嫁接'],desc:'烬焰花与霜脉蕨的嫁接体，喷射蒸汽冲击。',slow:.25,area:1.2,graft:true},
  solargourd:{id:'solargourd',name:'日轮瓠',icon:'☀',color:'#e8953f',cost:0,role:'wall',hp:760,damage:0,rate:7,tags:['日光','墙','嫁接'],desc:'辉光芽与甲壳根的嫁接体，兼顾生产与阻挡。',sun:25,graft:true}
};
export const SHOP_IDS=(Object.keys(PLANTS) as PlantId[]).filter(id=>!PLANTS[id].graft);

export const ENEMIES:Record<EnemyId,EnemyDef>={
  muckling:{id:'muckling',name:'油泥仔',color:'#778e3d',hp:95,speed:.58,damage:18,reward:7,score:60},
  scrapmite:{id:'scrapmite',name:'废铁螨',color:'#b56a45',hp:65,speed:.92,damage:14,reward:6,score:80},
  drumcan:{id:'drumcan',name:'桶甲兽',color:'#70808b',hp:300,speed:.38,damage:28,reward:13,score:160,armor:.72},
  smogwisp:{id:'smogwisp',name:'烟霾灵',color:'#717080',hp:125,speed:.62,damage:20,reward:9,score:120,special:'phase'},
  blightbug:{id:'blightbug',name:'疫囊虫',color:'#a5b83b',hp:170,speed:.5,damage:23,reward:11,score:145,special:'toxic'},
  jumprat:{id:'jumprat',name:'跃脊鼠',color:'#d2643f',hp:82,speed:.88,damage:18,reward:8,score:120,special:'jump'},
  crusher:{id:'crusher',name:'锈锤魔',color:'#75503b',hp:490,speed:.34,damage:44,reward:18,score:250,armor:.82},
  signalbeast:{id:'signalbeast',name:'信标兽',color:'#b6423b',hp:155,speed:.56,damage:22,reward:12,score:180,special:'haste'}
};

export const WAVES:{label:string;enemies:EnemyId[];boss?:{name:string;color:string;hp:number;speed:number;damage:number}}[]=[
  {label:'油泥侦察',enemies:['muckling','muckling','muckling','muckling']},
  {label:'废铁窸窣',enemies:['muckling','scrapmite','scrapmite','muckling','scrapmite']},
  {label:'桶甲推进',enemies:['muckling','drumcan','scrapmite','muckling','drumcan']},
  {label:'烟霾漫入',enemies:['smogwisp','blightbug','muckling','smogwisp','scrapmite','blightbug']},
  {label:'堆肥巨像',enemies:['muckling','scrapmite','blightbug'],boss:{name:'堆肥巨像',color:'#687f32',hp:1800,speed:.28,damage:55}},
  {label:'跃脊躁动',enemies:['jumprat','jumprat','scrapmite','jumprat','smogwisp','muckling']},
  {label:'锈锤压境',enemies:['crusher','drumcan','blightbug','crusher','scrapmite']},
  {label:'信标冲锋',enemies:['signalbeast','muckling','scrapmite','signalbeast','jumprat','muckling','drumcan']},
  {label:'混沌编队',enemies:['drumcan','crusher','smogwisp','jumprat','signalbeast','blightbug','scrapmite']},
  {label:'毒雾母树',enemies:['blightbug','smogwisp','drumcan'],boss:{name:'毒雾母树',color:'#75633e',hp:3300,speed:.25,damage:70}},
  {label:'霾潮围城',enemies:['smogwisp','smogwisp','blightbug','crusher','jumprat','signalbeast','drumcan']},
  {label:'铁桶洪流',enemies:['drumcan','drumcan','signalbeast','scrapmite','drumcan','crusher','jumprat']},
  {label:'跃鼠风暴',enemies:['jumprat','jumprat','jumprat','crusher','signalbeast','smogwisp','blightbug','jumprat']},
  {label:'终末前奏',enemies:['crusher','drumcan','signalbeast','blightbug','crusher','smogwisp','jumprat','drumcan']},
  {label:'天穹腐龙',enemies:['crusher','smogwisp','signalbeast','jumprat'],boss:{name:'天穹腐龙',color:'#8f342f',hp:5600,speed:.31,damage:100}}
];

export const GRAFTS:[PlantId,PlantId,PlantId][]=[['emberbloom','frostfern','steamwing'],['sunbud','shellroot','solargourd']];
export const MUTATIONS:Record<PlantId,[{name:string;desc:string;damage:number;rate:number;hp:number},{name:string;desc:string;damage:number;rate:number;hp:number}]>=Object.fromEntries((Object.keys(PLANTS) as PlantId[]).map(id=>[id,[
  {name:'旺盛突变',desc:'伤害与产能提高 70%，强化核心职责。',damage:1.7,rate:.92,hp:1.1},
  {name:'共生突变',desc:'攻击速度提高 40%，生命提高 45%。',damage:1.15,rate:.6,hp:1.45}
]])) as typeof MUTATIONS;
