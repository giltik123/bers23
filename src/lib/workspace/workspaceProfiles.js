// WorkspaceProfiles — the 10 adaptive workspaces. Each profile defines what the
// workspace prioritizes, its recipe collection, quick actions and detection hints.
// Workspaces NEVER execute edits — they only organize tools and experience.
export const WORKSPACES = [
  {
    id: 'portrait', name: 'Portrait Studio', icon: 'User', tagline: 'Faces, skin, hair, eyes and expression',
    priorities: ['Face', 'Hair', 'Eyes', 'Skin', 'Smile', 'Teeth'],
    recipeIds: ['skin_smooth', 'face_remove_wrinkles', 'face_whiten_teeth', 'face_smile', 'eyes_enhance', 'hair_improve', 'hair_change_color', 'lips_color', 'pro_headshot'],
    quickActions: [
      { label: 'Smooth skin', prompt: 'Smooth and even out the skin naturally, removing blemishes but keeping realistic pores' },
      { label: 'Whiten teeth', prompt: 'Whiten the teeth to a natural bright white without changing their shape' },
      { label: 'Enhance eyes', prompt: 'Enhance the eyes: brighten the whites slightly, sharpen the iris detail and add a subtle catchlight' },
      { label: 'Tame flyaways', prompt: 'Tame frizz and flyaway hairs, keeping the hairstyle natural and polished' },
    ],
    detect: { objects: ['person', 'face', 'woman', 'man', 'head', 'portrait'], style: ['portrait', 'headshot'] },
    tip: 'Beauty recipes work best here — try Smooth Skin or Pro Headshot.',
  },
  {
    id: 'fashion', name: 'Fashion Studio', icon: 'Shirt', tagline: 'Clothing, shoes, accessories and try-on',
    priorities: ['Clothing', 'Shoes', 'Accessories', 'Virtual Try-On', 'Color replacement', 'Material replacement'],
    recipeIds: ['clothing_replace_top', 'clothing_change_pants', 'clothing_recolor', 'clothing_material', 'accessories_add', 'accessories_remove', 'shoes_recolor'],
    quickActions: [
      { label: 'Virtual Try-On', prompt: 'Replace the outfit with a stylish new garment that fits the person naturally, with realistic folds and correct body fit' },
      { label: 'Recolor garment', prompt: 'Change the garment color, keeping fabric texture, folds and shadows realistic' },
      { label: 'Swap material', prompt: 'Change the garment material with realistic texture, drape and light response' },
      { label: 'Add accessories', prompt: 'Add tasteful fashion accessories that complement the outfit, placed naturally and realistically' },
    ],
    detect: { objects: ['shirt', 't-shirt', 'dress', 'jacket', 'pants', 'jeans', 'skirt', 'coat', 'suit', 'shoes', 'sneakers', 'heels', 'bag', 'handbag'], style: ['fashion', 'editorial'] },
    tip: 'Try Virtual Try-On to swap the whole outfit in one step.',
  },
  {
    id: 'product', name: 'Product Studio', icon: 'Package', tagline: 'Commercial shots ready for marketplaces',
    priorities: ['Background removal', 'Shadow correction', 'Reflection', 'Commercial photography', 'Marketplace export'],
    recipeIds: ['bg_studio', 'bg_replace', 'object_recolor', 'detail_sharpen', 'light_improve'],
    quickActions: [
      { label: 'White background', prompt: 'Replace the background with a clean, seamless white studio backdrop with soft professional lighting' },
      { label: 'Fix shadows', prompt: 'Correct the product shadows: add a soft, natural contact shadow and remove harsh or double shadows' },
      { label: 'Clean reflections', prompt: 'Remove distracting reflections from the product surface while keeping natural highlights' },
      { label: 'Marketplace ready', prompt: 'Make this a professional e-commerce product photo: white background, even lighting, crisp detail, centered composition' },
    ],
    detect: { objects: ['bottle', 'box', 'product', 'shoe', 'watch', 'phone', 'laptop', 'chair', 'lamp', 'cosmetics', 'perfume'], style: ['product', 'studio', 'commercial'] },
    tip: 'A clean white background sells best — try the White Background action.',
  },
  {
    id: 'vehicle', name: 'Vehicle Studio', icon: 'Car', tagline: 'Showroom-quality automotive shots',
    priorities: ['Paint & gloss', 'Reflections', 'Wheels', 'Background', 'Lighting'],
    recipeIds: ['vehicle_recolor', 'vehicle_remove_reflections', 'vehicle_gloss', 'vehicle_clean_wheels', 'bg_replace', 'light_golden'],
    quickActions: [
      { label: 'Showroom gloss', prompt: 'Increase the gloss of the vehicle paint with a showroom-quality shine and deep, wet-look finish' },
      { label: 'Clean wheels', prompt: 'Make the wheels spotless: clean shiny rims, deep black dressed tires, no brake dust or dirt' },
      { label: 'Remove reflections', prompt: 'Remove distracting reflections from the vehicle body and windows, keeping natural highlights' },
    ],
    detect: { objects: ['car', 'truck', 'vehicle', 'motorcycle', 'bike', 'van', 'suv'], style: ['automotive'] },
    tip: 'Run the Car Photography chain for a full showroom look in one tap.',
  },
  {
    id: 'realestate', name: 'Real Estate Studio', icon: 'Home', tagline: 'Brighter rooms and better listings',
    priorities: ['Object removal', 'Furniture replacement', 'Lighting', 'Windows', 'Sky replacement'],
    recipeIds: ['object_remove', 'light_improve', 'sky_sunset', 'bg_replace', 'arch_facade'],
    quickActions: [
      { label: 'Declutter room', prompt: 'Remove clutter and personal items from the room, reconstructing clean surfaces naturally' },
      { label: 'Brighten interior', prompt: 'Brighten the interior with natural, even lighting and clear window views without blown highlights' },
      { label: 'Blue sky', prompt: 'Replace the sky with a bright clear blue sky and adjust the exterior lighting to match' },
      { label: 'Fresh facade', prompt: 'Refresh the building facade: clean surfaces, repaired paint, no dirt or damage' },
    ],
    detect: { objects: ['building', 'house', 'room', 'sofa', 'couch', 'bed', 'table', 'kitchen', 'window', 'furniture', 'wall'], style: ['interior', 'architecture', 'real estate'] },
    tip: 'Decluttering and brighter lighting make listings stand out.',
  },
  {
    id: 'landscape', name: 'Landscape Studio', icon: 'Mountain', tagline: 'Skies, water, mountains and weather',
    priorities: ['Sky', 'Water', 'Mountains', 'Trees', 'Weather', 'Time of day'],
    recipeIds: ['sky_sunset', 'sky_weather', 'nature_greener', 'light_golden', 'color_pop'],
    quickActions: [
      { label: 'Dramatic sky', prompt: 'Replace the sky with a dramatic sunset sky and adjust the scene lighting to match' },
      { label: 'Golden hour', prompt: 'Relight the scene with warm golden hour light and soft natural shadows' },
      { label: 'Lush greenery', prompt: 'Make the vegetation lush, green and healthy with vibrant natural color' },
      { label: 'Calm water', prompt: 'Make the water calm and reflective with a smooth, glassy surface' },
    ],
    detect: { objects: ['mountain', 'tree', 'sky', 'lake', 'river', 'sea', 'ocean', 'forest', 'beach', 'hill', 'field'], style: ['landscape', 'nature'] },
    tip: 'A dramatic sky and golden hour light transform any landscape.',
  },
  {
    id: 'food', name: 'Food Studio', icon: 'UtensilsCrossed', tagline: 'Menu-ready, appetizing food shots',
    priorities: ['Freshness', 'Color', 'Texture', 'Plating', 'Lighting'],
    recipeIds: ['food_appetizing', 'light_improve', 'color_pop', 'bg_blur'],
    quickActions: [
      { label: 'Appetizing look', prompt: 'Make the food look fresh and appetizing with rich color, appealing texture and a subtle glisten' },
      { label: 'Soft background', prompt: 'Blur the background with a soft photographic bokeh, keeping the dish perfectly sharp' },
      { label: 'Steam & freshness', prompt: 'Add subtle natural steam and a fresh, just-served look to the dish' },
    ],
    detect: { objects: ['food', 'plate', 'dish', 'meal', 'pizza', 'burger', 'cake', 'salad', 'drink', 'coffee', 'bowl'], style: ['food'] },
    tip: 'Rich color and a soft background make food irresistible.',
  },
  {
    id: 'creative', name: 'Creative Studio', icon: 'Paintbrush', tagline: 'All recipes and experimental editing unlocked',
    priorities: ['All recipes', 'Experimental editing', 'Advanced prompt editing'],
    recipeIds: ['creative_painting', 'restore_old_photo', 'color_pop', 'sky_weather', 'bg_replace', 'light_golden'],
    quickActions: [
      { label: 'Oil painting', prompt: 'Transform the image into an oil painting with visible brush strokes and rich canvas texture' },
      { label: 'Surreal edit', prompt: 'Apply a surreal, dreamlike transformation while keeping the main subject recognizable' },
      { label: 'Double exposure', prompt: 'Create an artistic double exposure effect blending the subject with a natural landscape' },
    ],
    detect: { objects: [], style: ['painting', 'illustration', 'render', 'art'] },
    tip: 'Everything is unlocked here — experiment freely with any prompt.',
  },
  {
    id: 'social', name: 'Social Studio', icon: 'Share2', tagline: 'Instagram, TikTok and YouTube-ready',
    priorities: ['Instagram', 'TikTok', 'YouTube', 'Thumbnail creation'],
    recipeIds: ['social_instagram', 'color_pop', 'bg_blur', 'detail_sharpen'],
    quickActions: [
      { label: 'Instagram glow', prompt: 'Apply a trendy social media aesthetic: soft glow, gentle warm tones and creamy background separation' },
      { label: 'TikTok pop', prompt: 'Make the image pop for short-form video: punchy vibrant colors, strong subject separation and crisp detail' },
      { label: 'YouTube thumbnail', prompt: 'Make this thumbnail-ready: high contrast, vivid colors, sharp subject and strong visual impact' },
    ],
    detect: { objects: ['selfie'], style: ['social', 'instagram'] },
    tip: 'High contrast and vivid color drive clicks and engagement.',
  },
  {
    id: 'universal', name: 'Universal Studio', icon: 'LayoutGrid', tagline: 'Everything, for any image',
    priorities: ['All tools'],
    recipeIds: ['light_improve', 'color_pop', 'detail_sharpen', 'bg_blur', 'object_remove'],
    quickActions: [
      { label: 'Improve lighting', prompt: 'Improve the lighting: balanced exposure, soft flattering light on the subject and clean shadow detail' },
      { label: 'Boost colors', prompt: 'Enhance the colors with vivid but natural saturation, keeping skin tones accurate' },
      { label: 'Sharpen detail', prompt: 'Increase the overall image sharpness, enhancing fine detail without halos or noise' },
    ],
    detect: { objects: [], style: [] },
    tip: 'A balanced toolkit for any photo.',
  },
];

export const getWorkspace = (id) => WORKSPACES.find((w) => w.id === id) || WORKSPACES.find((w) => w.id === 'universal');