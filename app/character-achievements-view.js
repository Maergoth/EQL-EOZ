import { normalizeAchievementExport } from './achievement-export.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=completed=>'<span class="character-achievement-status'+(completed?' is-complete':'')+'">'+(completed?'Complete':'In progress')+'</span>';

/** Read-only local view. Completion comes from the export, not its objectives. */
export function characterAchievementsMarkup(value){
    const data=normalizeAchievementExport(value);
    if(!data)return '<p class="settings-helper">Import your inventory and achievements together to include achievement progress in your character sheet.</p>';
    return '<details class="character-achievements"><summary>Achievements <small>'+data.completedCount+' / '+data.achievementCount+' complete</small></summary><p class="settings-helper">Recorded from your achievements export.</p>'+data.categories.map(category=>{
        const completed=category.achievements.filter(achievement=>achievement.completed).length;
        return '<details class="character-achievement-category"><summary>'+escape(category.name)+' <small>'+completed+' / '+category.achievements.length+'</small></summary>'+category.achievements.map(achievement=>{
            const heading='<span>'+escape(achievement.name)+'</span>'+status(achievement.completed);
            if(!achievement.objectives.length)return '<div class="character-achievement-heading">'+heading+'</div>';
            return '<details class="character-achievement"><summary>'+heading+'</summary><ul>'+achievement.objectives.map(objective=>'<li><span>'+escape(objective.text)+'</span>'+(Object.hasOwn(objective,'current')?'<strong class="character-achievement-progress">'+objective.current+' / '+objective.required+'</strong>':'')+status(objective.completed)+'</li>').join('')+'</ul></details>';
        }).join('')+'</details>';
    }).join('')+'</details>';
}
