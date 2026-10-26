'use strict';
const {createTextExportReader}=require('./inventory-file-host.cjs');
const achievements=createTextExportReader({channel:'eye-of-zomm:achievement-file',label:'achievement',suffix:'Achievements',command:'/outputfile achievements'});
module.exports={AchievementFileHost:achievements.FileHost,achievementFileName:achievements.fileName,decodeAchievementText:achievements.decodeText,MAX_ACHIEVEMENT_BYTES:achievements.maxBytes};
