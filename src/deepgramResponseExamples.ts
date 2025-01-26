// This is the top level object returned from nova
const deepgram_results_top_level_object = {
  type: 'Results',
  channel_index: [ 0, 1 ],
  duration: 0.08200002,
  start: 2.99,
  is_final: true,
  speech_final: false,
  channel: { alternatives: [ [Object] ] },
  metadata: {
    request_id: 'some_request_id',
    model_info: {
      name: '2-general-nova',
      version: '2024-01-18.26916',
      arch: 'nova-2'
    },
    model_uuid: 'some_uuid'
  },
  from_finalize: false
}

// Going deeper we can see inside of alternatives, array of transcript type objects
const alternative_transcripts = [
  {
    transcript: 'How are you?',
    confidence: 0.9824219,
    words: [ [Object], [Object], [Object] ]
  }
]
// Then deeper we can see the array of words
const words_array_from_transcript = [
  {
    word: 'how',
    start: 1.68,
    end: 1.92,
    confidence: 0.99121094,
    punctuated_word: 'How'
  },
  {
    word: 'are',
    start: 1.92,
    end: 2.1599998,
    confidence: 0.9980469,
    punctuated_word: 'are'
  },
  {
    word: 'you',
    start: 2.1599998,
    end: 2.6599998,
    confidence: 0.99316406,
    punctuated_word: 'you?'
  }
]

