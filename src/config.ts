import {
  select,
  urlTest,
  fallback,
  loadBalance,
  dns,
  sniffer,
  experimental,
  ruleProvider,
  proxyProvider,
  ruleSet,
  domainSuffix,
  match,
  createConfig,
  toYaml,
} from 'mihomo-config';
import type { D1Database } from '@cloudflare/workers-types';
import {
  getProxyUrls,
  getProxiesByType,
  getRulesets,
  getEndpoint,
  type ProxyUrlRow,
} from './db.js';

// --- Filter regexes (replace YAML anchor &FilterXX) ---

const FilterJP = '(?i)(日本|川日|东京|大阪|泉日|埼玉|沪日|深日|[^-]日|JP|Japan)';
const FilterHK = '(?i)港|HK|Hong Kong|🇭🇰|hongkong';
const FilterUS =
  '(?i)美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|US|United States';
const FilterTW = '(?i)台|新北|彰化|TW|Taiwan';
const FilterMainCountry = `(?i)(${[FilterJP, FilterHK, FilterUS, FilterTW]
  .map((f) => f.replace('(?i)', ''))
  .join('|')})`;

// --- Proxy group proxy lists ---

// --- Proxy group template helpers (replace YAML anchor &PROXY_GROUPS_HELPER_*) ---

function countrySelect(
  name: string,
  useList: string[],
  extraProxies: string[] = [],
  filter?: string,
  excludeFilter?: string,
) {
  return select({
    name,
    type: 'select',
    proxies: [...extraProxies],
    use: useList,
    'include-all-proxies': true,
    ...(filter ? { filter } : {}),
    ...(excludeFilter ? { 'exclude-filter': excludeFilter } : {}),
  });
}

function countryAuto(name: string, useList: string[], filter?: string, excludeFilter?: string) {
  return urlTest({
    name,
    type: 'url-test',
    url: 'https://cp.cloudflare.com',
    interval: 300,
    tolerance: 100,
    hidden: true,
    use: useList,
    'include-all-proxies': true,
    ...(filter ? { filter } : {}),
    ...(excludeFilter ? { 'exclude-filter': excludeFilter } : {}),
  });
}

function countryLoadBalance(
  name: string,
  useList: string[],
  filter?: string,
  excludeFilter?: string,
) {
  return loadBalance({
    name,
    type: 'load-balance',
    interval: 300,
    strategy: 'sticky-sessions',
    hidden: true,
    use: useList,
    'include-all-proxies': true,
    ...(filter ? { filter } : {}),
    ...(excludeFilter ? { 'exclude-filter': excludeFilter } : {}),
  });
}

function countryFallback(name: string, useList: string[], filter?: string, excludeFilter?: string) {
  return fallback({
    name,
    type: 'fallback',
    interval: 300,
    lazy: true,
    url: 'https://cp.cloudflare.com',
    hidden: true,
    use: useList,
    'include-all-proxies': true,
    ...(filter ? { filter } : {}),
    ...(excludeFilter ? { 'exclude-filter': excludeFilter } : {}),
  });
}

// --- Countries to generate groups for ---

const countries: readonly { name: string; filter: string }[] = [
  { name: '香港', filter: FilterHK },
  { name: '日本', filter: FilterJP },
  { name: '美国', filter: FilterUS },
  { name: '台湾', filter: FilterTW },
];

// --- Proxy group proxy lists ---

const countryNames = countries.map((c) => c.name);
const tailItems = ['其他国家', 'DIRECT', 'REJECT'];

const outboundList = [...countryNames, ...tailItems];
const proxyFirst = ['节点选择', ...outboundList];
const directFirst = ['DIRECT', '节点选择', ...countryNames, '其他国家', 'REJECT'];
const rejectFirst = ['REJECT', '节点选择', ...countryNames, '其他国家', 'DIRECT'];
const banJp = [...countryNames.filter((c) => c !== '日本'), ...tailItems, '日本'];
const onlyJp = ['日本', '节点选择', ...countryNames.filter((c) => c !== '日本'), ...tailItems];

// --- Rule provider template helpers ---

function httpDomainMrs(name: string, url: string) {
  return ruleProvider({
    type: 'http',
    behavior: 'domain',
    format: 'mrs',
    interval: 3600,
    url,
    proxy: '节点选择',
  });
}

function httpIpcidrMrs(name: string, url: string) {
  return ruleProvider({
    type: 'http',
    behavior: 'ipcidr',
    format: 'mrs',
    interval: 3600,
    url,
    proxy: '节点选择',
  });
}

function httpDomainYaml(name: string, url: string) {
  return ruleProvider({
    type: 'http',
    behavior: 'domain',
    format: 'yaml',
    interval: 3600,
    url,
    proxy: '节点选择',
  });
}

function httpIpcidrYaml(name: string, url: string) {
  return ruleProvider({
    type: 'http',
    behavior: 'ipcidr',
    format: 'yaml',
    interval: 3600,
    url,
    proxy: '节点选择',
  });
}

function geositeMrs(name: string) {
  const filename = name.replace(/^geosite_/, '');
  return httpDomainMrs(
    name,
    `https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/meta/geo/geosite/${filename}.mrs`,
  );
}

function geoipMrs(name: string) {
  const filename = name.replace(/^geoip_/, '');
  return httpIpcidrMrs(
    name,
    `https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/meta/geo/geoip/${filename}.mrs`,
  );
}

const geositeProviders = new Set<string>();
const geoipProviders = new Set<string>();

function geositeRule(name: string, proxy: string, noResolve?: string) {
  geositeProviders.add(name);
  return noResolve
    ? ruleSet(`geosite_${name}`, proxy, noResolve)
    : ruleSet(`geosite_${name}`, proxy);
}

function geoipRule(name: string, proxy: string, noResolve?: string) {
  geoipProviders.add(name);
  return noResolve ? ruleSet(`geoip_${name}`, proxy, noResolve) : ruleSet(`geoip_${name}`, proxy);
}

function geositeRef(name: string) {
  geositeProviders.add(name);
  return `rule-set:geosite_${name}`;
}

// --- Helpers for dynamic config from D1 ---

function getProviderName(item: ProxyUrlRow, index: number): string {
  if (item.provider_name) return item.provider_name;
  const prefix = item.type === 'auto' ? 'auto_dynamic_' : 'nonauto_dynamic_';
  return prefix + index;
}

// --- Main config builder ---

export async function buildConfig(db: D1Database, baseUrl: string) {
  geositeProviders.clear();
  geoipProviders.clear();

  // Fetch all config from D1
  const [proxyUrls, autoProxies, nonautoProxies, rulesets, autoToken, nonautoToken] =
    await Promise.all([
      getProxyUrls(db),
      getProxiesByType(db, 'auto'),
      getProxiesByType(db, 'nonauto'),
      getRulesets(db),
      getEndpoint(db, 'auto_proxy'),
      getEndpoint(db, 'nonauto_proxy'),
    ]);

  // Separate external proxy URLs by type
  const autoUrls = proxyUrls.filter((u) => u.type === 'auto');
  const nonautoUrls = proxyUrls.filter((u) => u.type === 'nonauto');

  // External proxy-provider names
  const extAutoNames = autoUrls.map((u, i) => getProviderName(u, i));
  const extNonAutoNames = nonautoUrls.map((u, i) => getProviderName(u, i));

  // Internal proxy-provider names
  const intAutoName = '内部自动';
  const intNonAutoName = '内部非自动';

  const hasIntAuto = autoProxies.length > 0 && !!autoToken;
  const hasIntNonAuto = nonautoProxies.length > 0 && !!nonautoToken;
  const autoList = [...extAutoNames, ...(hasIntAuto ? [intAutoName] : [])];
  const allList = [
    ...extAutoNames,
    ...(hasIntAuto ? [intAutoName] : []),
    ...extNonAutoNames,
    ...(hasIntNonAuto ? [intNonAutoName] : []),
  ];

  // External proxy providers
  const extAutoProviders = Object.fromEntries(
    autoUrls.map((u, i) => [
      getProviderName(u, i),
      proxyProvider({ type: 'http', interval: 86400, url: u.url }),
    ]),
  );
  const extNonAutoProviders = Object.fromEntries(
    nonautoUrls.map((u, i) => [
      getProviderName(u, i),
      proxyProvider({ type: 'http', interval: 86400, url: u.url }),
    ]),
  );

  // Internal proxy providers
  const internalProviders: Record<string, Record<string, unknown>> = {};
  if (autoProxies.length > 0 && autoToken) {
    internalProviders[intAutoName] = proxyProvider({
      type: 'http',
      interval: 86400,
      url: `${baseUrl}/p/${autoToken}`,
    });
  }
  if (nonautoProxies.length > 0 && nonautoToken) {
    internalProviders[intNonAutoName] = proxyProvider({
      type: 'http',
      interval: 86400,
      url: `${baseUrl}/p/${nonautoToken}`,
    });
  }

  // Dynamic proxy groups from ruleset targets
  const countrySubGroups = [...countryNames, '其他国家'].flatMap((n) => [
    `${n}自动`,
    `${n}负载均衡`,
    `${n}自动回退`,
  ]);
  const standardGroups = new Set([
    '节点选择',
    'AIGC',
    '网盘',
    '流媒体',
    '苹果服务',
    '微软服务',
    '谷歌服务',
    'FCM推送',
    '网络测试',
    '广告',
    '禁日本IP',
    '仅限日本IP',
    ...countryNames,
    '其他国家',
    ...countrySubGroups,
    'DIRECT',
    'REJECT',
  ]);
  const dynamicGroups = [...new Set(rulesets.map((rs) => rs.target))].filter(
    (t) => !standardGroups.has(t),
  );

  return createConfig({
    'log-level': 'warning',
    // 路由器上开启没用，反正也检测不到局域网上其他进程的信息
    'find-process-mode': 'off',
    'keep-alive-idle': 600,
    'keep-alive-interval': 30,

    // DNS
    dns: dns({
      enable: true,
      'cache-algorithm': 'arc',
      'prefer-h3': false,
      'use-hosts': true,
      'use-system-hosts': true,
      'respect-rules': false,
      listen: '0.0.0.0:1053',
      'enhanced-mode': 'redir-host',
      'default-nameserver': ['114.114.114.114'],
      nameserver: ['https://120.53.53.53/dns-query#DIRECT', 'https://223.5.5.5/dns-query#DIRECT'],
      'proxy-server-nameserver': ['https://223.5.5.5/dns-query#DIRECT'],
      'nameserver-policy': {
        [geositeRef('geolocation-!cn')]: [
          // disable-qtype-64=true&disable-qtype-65=true 是为了关闭ech（会导致获取不到域名）
          'https://1.1.1.1/dns-query#节点选择&cs=120.244.157.22/24&ecs-override=true&disable-qtype-64=true&disable-qtype-65=true',
          'https://8.8.8.8/dns-query#节点选择&ecs=120.244.157.22/24&ecs-override=true&disable-qtype-64=true&disable-qtype-65=true',
        ],
      },
    }),

    // Sniffer
    sniffer: sniffer({
      enable: true,
      sniff: {
        HTTP: { ports: ['80', '8080-8880'], 'override-destination': true },
        TLS: { ports: ['443', '8443'] },
        QUIC: { ports: ['443', '8443'] },
      },
      'force-domain': [
        '+.google.com',
        '+.netflix.com',
        '+.nflxvideo.net',
        '+.amazonaws.com',
        '+.media.dssott.com',
      ],
      'skip-domain': [
        'Mijia Cloud',
        'dlg.io.mi.com',
        geositeRef('apple-cn'),
        '+.push.apple.com',
        geositeRef('microsoft@cn'),
        geositeRef('private'),
        'Pairing',
        'Directory',
      ],
    }),

    // Proxy providers
    'proxy-providers': {
      ...extAutoProviders,
      ...extNonAutoProviders,
      ...internalProviders,
    },

    // Proxy groups
    'proxy-groups': [
      select({ name: '节点选择', type: 'select', proxies: outboundList }),
      ...dynamicGroups.map((name) => select({ name, type: 'select', proxies: proxyFirst })),
      select({ name: 'AIGC', type: 'select', proxies: proxyFirst }),
      select({ name: '网盘', type: 'select', proxies: proxyFirst }),
      select({ name: '流媒体', type: 'select', proxies: proxyFirst }),
      select({ name: '苹果服务', type: 'select', proxies: proxyFirst }),
      select({ name: '微软服务', type: 'select', proxies: proxyFirst }),
      select({ name: '谷歌服务', type: 'select', proxies: proxyFirst }),
      select({ name: 'FCM推送', type: 'select', proxies: directFirst }),
      select({ name: '网络测试', type: 'select', proxies: proxyFirst }),
      select({ name: '广告', type: 'select', proxies: rejectFirst }),
      select({ name: '禁日本IP', type: 'select', proxies: banJp }),
      select({ name: '仅限日本IP', type: 'select', proxies: onlyJp }),
      ...countries.flatMap(({ name, filter }) => [
        countrySelect(name, allList, [`${name}自动`, `${name}负载均衡`], filter),
        countryAuto(`${name}自动`, autoList, filter),
        countryLoadBalance(`${name}负载均衡`, autoList, filter),
        countryFallback(`${name}自动回退`, allList, filter),
      ]),
      countrySelect(
        '其他国家',
        allList,
        ['其他国家自动', '其他国家负载均衡'],
        undefined,
        FilterMainCountry,
      ),
      countryAuto('其他国家自动', autoList, undefined, FilterMainCountry),
      countryLoadBalance('其他国家负载均衡', autoList, undefined, FilterMainCountry),
      countryFallback('其他国家自动回退', allList, undefined, FilterMainCountry),
    ],

    // Rules
    rules: [
      // 1 自定义规则(最高优先级，发现哪个域名不对及时补充到这里)
      ...rulesets.map((rs) =>
        rs.no_resolve ? ruleSet(rs.name, rs.target, 'no-resolve') : ruleSet(rs.name, rs.target),
      ),
      // 2 去广告(效果有限，可以去掉)
      geositeRule('category-ads-all', '广告'),
      // 3 特殊规则（需要配合特殊代理组使用）
      // FCM推送
      geositeRule('googlefcm', 'FCM推送'),
      // 国外网络测试
      geositeRule('test-ipv6', '网络测试'),
      geositeRule('category-ip-geo-detect', '网络测试'),
      geositeRule('category-speedtest', '网络测试'),
      // AIGC
      geositeRule('category-ai-chat-!cn', 'AIGC'),
      geositeRule('category-ai-!cn', 'AIGC'),
      // 流媒体
      geositeRule('netflix', '流媒体'),
      geositeRule('youtube', '流媒体'),
      geositeRule('disney', '流媒体'),
      geositeRule('hulu', '流媒体'),
      geositeRule('primevideo', '流媒体'),
      geositeRule('hbo', '流媒体'),
      geositeRule('apple-tvplus', '流媒体'),
      // 国外网盘
      geositeRule('pikpak', '网盘'),
      geositeRule('onedrive', '网盘'),
      geositeRule('mega', '网盘'),
      geositeRule('dropbox', '网盘'),
      domainSuffix('drive.usercontent.google.com', '网盘'),
      // 苹果服务
      geositeRule('apple', '苹果服务'),
      // 微软服务
      geositeRule('microsoft', '微软服务'),
      // 谷歌服务
      geositeRule('google', '谷歌服务'),
      // 地区敏感
      geositeRule('javdb', '禁日本IP'),
      geositeRule('dlsite', '仅限日本IP'),
      geositeRule('dmm', '仅限日本IP'),
      geositeRule('tiktok', '仅限日本IP'),
      // 4 优先走代理的（尽量少一点，反正最后也是走代理）
      geositeRule('telegram', '节点选择'),
      geositeRule('twitter', '节点选择'),
      // 5 上面该走代理的都走的差不多了
      // 这里插一个geoip:cloudflare resolve !!!会进行dns解析!!!
      geoipRule('cloudflare', '节点选择'),
      geoipRule('telegram', '节点选择'),
      // 6 直连的（尽量多一点，因为保底是走代理的么）
      // 这三个包含绝大部分了
      geositeRule('private', 'DIRECT'),
      geositeRule('cn', 'DIRECT'),
      geositeRule('geolocation-cn', 'DIRECT'),
      // steam下载走国内 https://github.com/2dust/v2rayN/issues/1361#issuecomment-1856192253
      geositeRule('steam@cn', 'DIRECT'),
      // 国内提供服务的
      geositeRule('apple-cn', 'DIRECT'),
      geositeRule('google-cn', 'DIRECT'),
      geositeRule('cloudflare-cn', 'DIRECT'),
      geositeRule('google@cn', 'DIRECT'),
      geositeRule('apple@cn', 'DIRECT'),
      geositeRule('microsoft@cn', 'DIRECT'),
      geositeRule('icloud@cn', 'DIRECT'),
      // 国内网络测试
      geositeRule('category-ip-geo-detect@cn', 'DIRECT'),
      geositeRule('category-speedtest@cn', 'DIRECT'),
      // tracker
      geositeRule('tracker', 'DIRECT'),
      // 打洞
      geositeRule('category-proxy-tunnels', 'DIRECT'),
      geoipRule('private', 'DIRECT'),
      geoipRule('cn', 'DIRECT'),
      // 6 兜底
      match('节点选择'),
    ],

    // Rule providers
    'rule-providers': {
      ...Object.fromEntries(
        rulesets.map((rs) => [
          rs.name,
          rs.behavior === 'ipcidr'
            ? httpIpcidrYaml(rs.name, `${baseUrl}/r/${rs.id}`)
            : httpDomainYaml(rs.name, `${baseUrl}/r/${rs.id}`),
        ]),
      ),
      ...Object.fromEntries(
        [...geositeProviders].map((name) => [`geosite_${name}`, geositeMrs(`geosite_${name}`)]),
      ),
      ...Object.fromEntries(
        [...geoipProviders].map((name) => [`geoip_${name}`, geoipMrs(`geoip_${name}`)]),
      ),
    },

    experimental: experimental({ 'dialer-ip4p-convert': true }),
  });
}

export function generateYaml(config: Record<string, unknown>): string {
  return toYaml(config);
}
