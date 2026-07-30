import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests',workers:1,timeout:45_000,expect:{timeout:5_000},
  use:{baseURL:'http://127.0.0.1:5195',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:5195',reuseExistingServer:true,timeout:20_000},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome'],channel:'chromium',viewport:{width:1280,height:720}}},
    {name:'mobile',use:{...devices['iPhone 13'],browserName:'chromium',channel:'chromium'}}
  ]
});
