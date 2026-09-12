

## Questions for developer (Maybe  these should be added to development )

1. Why does keywords tab render everything lowercase?
	1. 
2. Is there a reason you exclude BEAT and STORYLINE as annotation types?
	1. Oversight. I'll fix it.
3. For boneyard notes, you group them sections. Would it be worth grouping all annotations in sections?
	1. Most elements are grouped (synopses or inline notes). Notepad notes are grouped if you use a single line return. However, Notepad notes are difficult to parse, which is why a double line return ends the grouping. On the other hand, Boneyards are easy to parse because they are wrapped with markup.

## DEVELOPMENT TODOS (what I would do)

## Next Steps:

- [ ] Ask AI, any questions
- [ ] Make a simple .fountain to understand whats going on.
- [ ] Check does he include Keyworks in the anotation tab?

BE VERY CAREFUL, COULD GET VERY COMPLEX IF I START PUTTING IN LOTS OF NEW TABS, ALL WITH DIFFERENT RULES AND FILTERS.

### H

- [ ] I’ve reported 3 bugs, fix them or have them fixed. (see [https://github.com/lmparppei/BeatPlugins/issues](https://github.com/lmparppei/BeatPlugins/issues))
- [ ] add a sections tab, with a delete all.
- [ ] add a warning before you delete anything

### M

- [ ] Boneyard groups boneyard notes. Maybe do the same for all annotations, ie group them by scene/sections?
- [ ] Move the filter menu 2 the right, so it doesnt obstruct the list.



### LOW

- [ ] Include STORYLINE and BEAT
- [ ] Put boneyard and Omits on a seperate tab. (LOW)
- [ ] Remove synopsis from Annotations tab? (its not a checkbox thing)
- [ ] Move the search bar above the tabs.
- [ ] Could we lock the keywords window (ie not floating.)



## 

## Current design

2 tabs  
Keywords and annotation.

## Keywords Tab

Each time you click a keyword, it goes to the next appearance.

- [ ] what the diffence between the blue pills on the keyword tabs.

## Annotations:

seems to be everything  that not a keyword.

