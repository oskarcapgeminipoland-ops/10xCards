/**
 * Central Polish UI string catalog.
 *
 * Single source for every user-facing string in the app. No i18n framework —
 * components `import { t } from "@/lib/i18n"` and read keys by name
 * (`t.deck.newButton`). Interpolated strings are functions.
 *
 * The app is Polish-only; there is deliberately no locale switching. Raw
 * Supabase auth provider error text (invalid credentials, etc.) is passed
 * through untranslated — see plan "What We're NOT Doing".
 */

/** Polish plural picker: [one, few, many] by the standard grammatical rules. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms[0];
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return forms[1];
  return forms[2];
}

export const t = {
  common: {
    cancel: "Anuluj",
    delete: "Usuń",
    tryAgain: "Spróbuj ponownie",
    somethingWentWrong: "Coś poszło nie tak",
  },

  meta: {
    defaultTitle: "10xCards",
    description:
      "10xCards — wklej tekst, pozwól AI wygenerować fiszki i ucz się metodą powtórek opartą na algorytmie SRS.",
    titleSignIn: "Logowanie",
    titleSignUp: "Rejestracja",
    titleFlashcards: "Fiszki",
    titleGenerate: "Generowanie fiszek",
    titleReview: "Powtórka",
    titleSettings: "Ustawienia",
  },

  nav: {
    settings: "Ustawienia",
    flashcards: "Fiszki",
    generate: "Generuj",
    review: "Powtórka",
    signOut: "Wyloguj się",
    notSignedIn: "Niezalogowany",
    signIn: "Zaloguj się",
    signUp: "Zarejestruj się",
  },

  landing: {
    heroTitle: "Ucz się szybciej dzięki fiszkom tworzonym przez AI",
    heroPitch:
      "Wklej dowolny tekst, a 10xCards wygeneruje z niego propozycje fiszek. Zaakceptuj, popraw lub odrzuć każdą — zaakceptowane trafiają do sesji powtórek opartej na algorytmie SRS.",
    ctaPrimary: "Zarejestruj się",
    ctaSecondary: "Zaloguj się",
    howItWorksTitle: "Jak to działa",
    step1Title: "Wklej tekst",
    step1Body: "Artykuł, rozdział podręcznika, notatki — dowolny materiał, który chcesz przyswoić.",
    step2Title: "AI generuje fiszki",
    step2Body: "Przejrzyj propozycje i zaakceptuj te, które chcesz zachować.",
    step3Title: "Powtarzaj we właściwym momencie",
    step3Body: "Algorytm SRS sam decyduje, kiedy pokazać każdą fiszkę ponownie.",
  },

  settings: {
    heading: "Ustawienia",
    accountTitle: "Konto",
    signedInAs: "Zalogowano jako",
    signOut: "Wyloguj się",
  },

  auth: {
    emailLabel: "E-mail",
    emailPlaceholder: "ty@przyklad.pl",
    passwordLabel: "Hasło",
    passwordPlaceholder: "Twoje hasło",
    passwordPlaceholderSignup: "Min. 6 znaków",
    confirmPasswordLabel: "Powtórz hasło",
    confirmPasswordPlaceholder: "Wpisz hasło ponownie",
    emailRequired: "E-mail jest wymagany",
    emailInvalid: "Podaj poprawny adres e-mail",
    passwordRequired: "Hasło jest wymagane",
    passwordTooShort: (n: number) => `Hasło musi mieć co najmniej ${n} ${plural(n, ["znak", "znaki", "znaków"])}`,
    confirmPasswordRequired: "Potwierdź hasło",
    passwordsMismatch: "Hasła nie są takie same",
    charactersNeeded: (n: number) => `Brakuje jeszcze ${n} ${plural(n, ["znaku", "znaków", "znaków"])}`,
    signInButton: "Zaloguj się",
    signInPending: "Logowanie...",
    signUpButton: "Utwórz konto",
    signUpPending: "Tworzenie konta...",
    showPassword: "Pokaż hasło",
    hidePassword: "Ukryj hasło",
    signInHeading: "Zaloguj się",
    signUpHeading: "Zarejestruj się",
    noAccount: "Nie masz konta?",
    haveAccount: "Masz już konto?",
    supabaseNotConfigured: "Supabase nie jest skonfigurowany",
    confirmDevEmoji: "✅",
    confirmDevHeading: "Rejestracja zakończona",
    confirmDevDescription: "Twoje konto zostało utworzone. Możesz się teraz zalogować.",
    confirmDevLink: "Przejdź do logowania",
    confirmProdEmoji: "📧",
    confirmProdHeading: "Sprawdź skrzynkę e-mail",
    confirmProdDescription: "Wysłaliśmy link potwierdzający na Twój adres e-mail. Kliknij go, aby aktywować konto.",
    confirmProdLink: "Wróć do logowania",
  },

  flashcardsPage: {
    heading: "Twoje fiszki",
    reviewLink: "Powtórka",
    generateLink: "Generuj z AI",
  },

  generatePage: {
    heading: "Generuj fiszki z AI",
  },

  reviewPage: {
    heading: "Sesja powtórek",
  },

  deck: {
    searchPlaceholder: "Szukaj w fiszkach...",
    searchAriaLabel: "Szukaj fiszek",
    newButton: "Nowa fiszka",
    createFirst: "Utwórz pierwszą fiszkę",
    emptyNoCards: "Nie masz jeszcze żadnych fiszek.",
    emptyNoMatch: (query: string) => `Brak fiszek pasujących do „${query}".`,
    editAriaLabel: "Edytuj fiszkę",
    deleteAriaLabel: "Usuń fiszkę",
    loadError: "Nie udało się wczytać fiszek",
    createdToast: "Fiszka utworzona",
    createErrorToast: "Nie udało się utworzyć fiszki",
    updatedToast: "Fiszka zaktualizowana",
    updateErrorToast: "Nie udało się zaktualizować fiszki",
    deletedToast: "Fiszka usunięta",
    deleteErrorToast: "Nie udało się usunąć fiszki",
    createDialogTitle: "Nowa fiszka",
    createDialogDescription: "Dodaj pytanie i odpowiedź do swojego zestawu.",
    editDialogTitle: "Edytuj fiszkę",
    editDialogDescription: "Zmień pytanie lub odpowiedź.",
    pageSizeLabel: "Fiszek na stronę",
    prevPage: "Poprzednia",
    nextPage: "Następna",
    pageAria: (n: number) => `Strona ${n}`,
  },

  form: {
    questionLabel: "Pytanie",
    answerLabel: "Odpowiedź",
    questionPlaceholder: "O co chcesz zostać zapytany/a?",
    answerPlaceholder: "Jaka jest odpowiedź?",
    creating: "Tworzenie...",
    saving: "Zapisywanie...",
    createSubmit: "Utwórz fiszkę",
    saveSubmit: "Zapisz zmiany",
  },

  generate: {
    statusMessages: [
      "Czytam Twój tekst...",
      "Wyszukuję kluczowe fakty i pojęcia...",
      "Układam pary pytanie–odpowiedź...",
      "Już prawie gotowe...",
    ],
    sourceLabel: "Tekst źródłowy",
    sourcePlaceholder: "Wklej tekst, który chcesz zamienić na fiszki...",
    generateButton: "Generuj",
    generateAgainButton: "Generuj ponownie",
    generatingButton: "Generowanie...",
    generatedToast: (n: number) => `Wygenerowano ${n} ${plural(n, ["fiszkę", "fiszki", "fiszek"])}`,
    generatedWithDroppedToast: (n: number, dropped: number) =>
      `Wygenerowano ${n} ${plural(n, ["fiszkę", "fiszki", "fiszek"])} — ${dropped} pominięto z powodu błędów formatowania`,
    generateErrorToast: "Nie udało się wygenerować fiszek",
    acceptedToast: "Fiszka dodana do zestawu",
    acceptErrorToast: "Nie udało się zapisać fiszki",
    noneSurvived:
      "Żadna fiszka z tego tekstu nie przeszła walidacji. Spróbuj wygenerować ponownie lub wklej inny tekst.",
    editAriaLabel: "Edytuj propozycję",
    rejectAriaLabel: "Odrzuć propozycję",
    acceptAriaLabel: "Zaakceptuj propozycję",
    editDialogTitle: "Edytuj propozycję",
    editDialogDescription: "Zmień pytanie lub odpowiedź przed zaakceptowaniem.",
    replaceTitle: "Zastąpić oczekujące propozycje?",
    replaceDescription: (n: number) =>
      `Masz jeszcze ${n} nieprzejrzan${plural(n, ["ą propozycję", "e propozycje", "ych propozycji"])}. Ponowne generowanie ${n === 1 ? "ją" : "je"} odrzuci i zastąpi listę nowymi propozycjami.`,
  },

  review: {
    ratingAgain: "Powtórz",
    ratingHard: "Trudne",
    ratingGood: "Dobre",
    ratingEasy: "Łatwe",
    loadError: "Nie udało się wczytać sesji powtórek",
    submitError: "Nie udało się zapisać oceny — spróbuj ponownie",
    emptyNoCards: "Nie masz jeszcze żadnych fiszek — nie ma czego powtarzać.",
    generateWithAi: "Generuj fiszki z AI",
    emptyNoneDue: "Nic nie czeka na powtórkę — wróć później.",
    backToFlashcards: "Wróć do fiszek",
    sessionComplete: "Sesja zakończona",
    showAnswer: "Pokaż odpowiedź",
    cardCounter: (n: number, total: number) => `Fiszka ${n} z ${total}`,
    formatInterval: (intervalDays: number) => {
      if (intervalDays <= 0) return "<1 dz.";
      return `${intervalDays} dz.`;
    },
  },

  delete: {
    title: "Usunąć tę fiszkę?",
    description: (question: string) => `Trwale usuwa to „${question}". Tej operacji nie można cofnąć.`,
    deleting: "Usuwanie...",
  },

  validation: {
    questionRequired: "Pytanie jest wymagane",
    questionTooLong: "Pytanie może mieć maksymalnie 500 znaków",
    answerRequired: "Odpowiedź jest wymagana",
    answerTooLong: "Odpowiedź może mieć maksymalnie 1000 znaków",
    sourceTextRequired: "Tekst źródłowy jest wymagany",
    sourceTextTooLong: "Tekst źródłowy może mieć maksymalnie 5000 znaków",
  },
} as const;
